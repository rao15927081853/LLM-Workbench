package com.workbench.service;

import com.workbench.config.ImageProperties;
import com.workbench.dto.GenerateRequest;
import com.workbench.dto.GenerateResponse;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;

@Service
public class ImageGenerationService {

    private static final Logger log = LoggerFactory.getLogger(ImageGenerationService.class); // 创建日志记录器

    /** 单次请求允许的最大生成数量 / 参考图数量 / 并发任务数（产品约定，统一为 5）。 */
    public static final int MAX_N = 5;
    public static final int MAX_IMAGES = 5;

    private final RestClient.Builder restClientBuilder; // RestClient 构建器
    private final ImageProperties properties; // 图片属性
    private final ExecutorService fanoutExecutor; // 多图并发线程池（固定 5）
    private final ObjectMapper objectMapper; // 手动解析上游响应（无视 content-type）

    public ImageGenerationService(RestClient.Builder restClientBuilder,
                                  ImageProperties properties,
                                  ExecutorService imageFanoutExecutor,
                                  ObjectMapper objectMapper) {
        this.restClientBuilder = restClientBuilder;
        this.properties = properties;
        this.fanoutExecutor = imageFanoutExecutor;
        this.objectMapper = objectMapper;
    }

    public GenerateResponse generate(GenerateRequest request) {
        String baseUrl = firstNonBlank(request.getBaseUrl(), properties.getDefaultBaseUrl()); // 请求地址
        String apiKey = firstNonBlank(request.getApiKey(), properties.getDefaultApiKey()); // API Key

        if (!StringUtils.hasText(baseUrl)) {
            throw new IllegalArgumentException("请求地址 (baseUrl) 未配置");
        }
        if (!StringUtils.hasText(apiKey)) {
            throw new IllegalArgumentException("API Key 未配置");
        }

        String endpoint = resolveEndpoint(baseUrl, request.getModel(), "/images/generations"); // 端点
        int count = clampCount(request.getN()); // 并发份数（1-5）
        Map<String, Object> body = buildBody(request); // 单次请求体（固定 n=1）

        log.info("Calling image endpoint {} with model {} ({} concurrent task(s))",
                endpoint, request.getModel(), count);

        RestClient client = restClientBuilder.build();
        // 上游对图像接口的 n>1 不透传，这里改为并发发起 count 个 n=1 请求再合并。
        List<GenerateResponse.ImageItem> images = fanOut(count, () -> {
            String raw = client.post()
                    .uri(endpoint)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(String.class);
            return parseImages(raw);
        });

        return new GenerateResponse(images, endpoint);
    }

    /**
     * Image-to-image: forwards uploaded reference images plus prompt/params to the
     * upstream "/images/edits" endpoint as multipart/form-data. Supports 1-5 reference
     * images (the {@code image[]} repeated field). When {@code n>1}, fans out N concurrent
     * {@code n=1} calls and merges results (upstream ignores n for image endpoints).
     */
    public GenerateResponse edit(GenerateRequest request, List<MultipartFile> images) {
        String baseUrl = firstNonBlank(request.getBaseUrl(), properties.getDefaultBaseUrl());
        String apiKey = firstNonBlank(request.getApiKey(), properties.getDefaultApiKey());

        if (!StringUtils.hasText(baseUrl)) {
            throw new IllegalArgumentException("请求地址 (baseUrl) 未配置");
        }
        if (!StringUtils.hasText(apiKey)) {
            throw new IllegalArgumentException("API Key 未配置");
        }
        if (images == null || images.isEmpty()) {
            throw new IllegalArgumentException("图生图需要至少上传一张参考图");
        }
        if (images.size() > MAX_IMAGES) {
            throw new IllegalArgumentException("参考图最多上传 " + MAX_IMAGES + " 张，当前 " + images.size() + " 张");
        }

        String endpoint = resolveEndpoint(baseUrl, request.getModel(), "/images/edits");
        int count = clampCount(request.getN());

        // 预先读出每张参考图的字节，便于在多个并发请求间安全复用（MultipartFile 的流只能读一次）。
        List<CachedFile> cached = new ArrayList<>(images.size());
        for (MultipartFile file : images) {
            cached.add(toCachedFile(file));
        }

        log.info("Calling image edits endpoint {} with model {}, {} image(s), {} concurrent task(s)",
                endpoint, request.getModel(), cached.size(), count);

        RestClient client = restClientBuilder.build();
        List<GenerateResponse.ImageItem> result = fanOut(count, () -> {
            // 每个并发任务都要新建自己的 form（MultiValueMap 非线程安全，且 part 不应共享）。
            MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
            form.add("model", request.getModel());
            form.add("prompt", request.getPrompt());
            if (StringUtils.hasText(request.getSize())) {
                form.add("size", request.getSize());
            }
            if (StringUtils.hasText(request.getQuality())) {
                form.add("quality", request.getQuality());
            }
            if (StringUtils.hasText(request.getBackground())) {
                form.add("background", request.getBackground());
            }
            if (StringUtils.hasText(request.getOutputFormat())) {
                form.add("output_format", request.getOutputFormat());
            }
            for (CachedFile cf : cached) {
                form.add("image[]", cf.toResource());
            }

            String raw = client.post()
                    .uri(endpoint)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(form)
                    .retrieve()
                    .body(String.class);
            return parseImages(raw);
        });

        return new GenerateResponse(result, endpoint);
    }

    /**
     * 并发执行 count 个相同的图像请求（每个返回若干 ImageItem），合并所有成功结果。
     * 单个任务失败不影响其它任务（生图按张计费，尽量把已成功的返还给用户）；
     * 仅当全部失败时才抛出异常，错误信息取第一个失败原因。
     */
    private List<GenerateResponse.ImageItem> fanOut(
            int count, Callable<List<GenerateResponse.ImageItem>> task) {
        if (count <= 1) {
            // 单张直接同步执行，避免线程池开销，也保留原有的异常直抛语义。
            try {
                return task.call();
            } catch (RuntimeException e) {
                throw e;
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }

        List<Future<List<GenerateResponse.ImageItem>>> futures = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            futures.add(fanoutExecutor.submit(task));
        }

        List<GenerateResponse.ImageItem> merged = new ArrayList<>();
        RuntimeException firstError = null;
        int failures = 0;
        for (Future<List<GenerateResponse.ImageItem>> f : futures) {
            try {
                List<GenerateResponse.ImageItem> part = f.get();
                if (part != null) {
                    merged.addAll(part);
                }
            } catch (ExecutionException e) {
                failures++;
                Throwable cause = e.getCause() != null ? e.getCause() : e;
                log.warn("并发生成中有一个任务失败：{}", cause.toString());
                if (firstError == null) {
                    firstError = (cause instanceof RuntimeException re)
                            ? re : new RuntimeException(cause);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new RuntimeException("生成被中断", e);
            }
        }

        // 全部失败才抛错；否则返回成功的部分（前端能拿到几张是几张）。
        if (merged.isEmpty() && firstError != null) {
            throw firstError;
        }
        if (failures > 0) {
            log.warn("并发生成完成：成功 {} 张，失败 {} 个任务", merged.size(), failures);
        }
        return merged;
    }

    /** 把请求里的 n 收敛到 [1, MAX_N]，null/<=0 视为 1。 */
    private int clampCount(Integer n) {
        if (n == null || n <= 0) {
            return 1;
        }
        return Math.min(n, MAX_N);
    }

    /** 已读入内存的上传文件（字节 + 文件名），可在多个并发请求间复用。 */
    private record CachedFile(byte[] bytes, String filename) {
        Resource toResource() {
            return new ByteArrayResource(bytes) {
                @Override
                public String getFilename() {
                    return filename;
                }
            };
        }
    }

    private CachedFile toCachedFile(MultipartFile file) {
        String filename = StringUtils.hasText(file.getOriginalFilename())
                ? file.getOriginalFilename()
                : "image.png";
        try {
            return new CachedFile(file.getBytes(), filename);
        } catch (IOException e) {
            throw new UncheckedIOException("读取上传图片失败: " + filename, e);
        }
    }

    /**
     * Fetched remote image bytes plus its content type, for the download proxy.
     */
    public record RemoteImage(Resource resource, String contentType) {
    }

    /**
     * Fetches a remote image URL server-side (bypasses browser CORS) and returns its
     * bytes + content type so the controller can stream it as an attachment.
     */
    public RemoteImage fetchRemote(String url) {
        if (!StringUtils.hasText(url) || !(url.startsWith("http://") || url.startsWith("https://"))) {
            throw new IllegalArgumentException("无效的图片地址");
        }
        RestClient client = restClientBuilder.build();
        ResponseEntity<byte[]> resp = client.get()
                .uri(url)
                .retrieve()
                .toEntity(byte[].class);

        byte[] body = resp.getBody();
        if (body == null || body.length == 0) {
            throw new IllegalArgumentException("下载图片失败：远程返回空内容");
        }
        MediaType ct = resp.getHeaders().getContentType();
        String contentType = ct != null ? ct.toString() : MediaType.APPLICATION_OCTET_STREAM_VALUE;
        return new RemoteImage(new ByteArrayResource(body), contentType);
    }

    /**
     * Builds the final image endpoint URL for the given path (e.g. "/images/generations"
     * or "/images/edits").
     * <p>
     * Rule: GPT-series models (model id starting with "gpt") require the OpenAI-style
     * "/v1" path segment. We append "/v1" + path to the base host, taking care
     * not to duplicate "/v1" if the user already included it in the configured base URL.
     * Non-GPT models append the path directly to the base.
     */
    String resolveEndpoint(String baseUrl, String model, String path) {
        String base = stripTrailingSlashes(baseUrl.trim());

        boolean isGpt = model != null && model.trim().toLowerCase().startsWith("gpt");
        boolean alreadyVersioned = base.toLowerCase().endsWith("/v1");

        StringBuilder url = new StringBuilder(base);
        if (isGpt && !alreadyVersioned) {
            url.append("/v1");
        }
        url.append(path);
        return url.toString();
    }

    private Map<String, Object> buildBody(GenerateRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", request.getModel());
        body.put("prompt", request.getPrompt());
        if (StringUtils.hasText(request.getSize())) {
            body.put("size", request.getSize());
        }
        if (StringUtils.hasText(request.getQuality())) {
            body.put("quality", request.getQuality());
        }
        // n 固定为 1：多张通过并发发起多个请求实现（上游不透传 n）。
        body.put("n", 1);
        if (StringUtils.hasText(request.getBackground())) {
            body.put("background", request.getBackground());
        }
        if (StringUtils.hasText(request.getOutputFormat())) {
            body.put("output_format", request.getOutputFormat());
        }
        return body;
    }

    /**
     * 解析上游返回的原始 JSON 文本（手动用 ObjectMapper，避免上游把 JSON 标成
     * application/octet-stream 时 RestClient 拒绝转换而报错）。
     */
    private List<GenerateResponse.ImageItem> parseImages(String rawJson) {
        List<GenerateResponse.ImageItem> items = new ArrayList<>();
        if (!StringUtils.hasText(rawJson)) {
            return items;
        }
        Map<String, Object> raw;
        try {
            raw = objectMapper.readValue(rawJson, new TypeReference<Map<String, Object>>() {});
        } catch (IOException e) {
            // 上游返回了非 JSON 内容（如 HTML 错误页），截断记录便于排查。
            String snippet = rawJson.length() > 300 ? rawJson.substring(0, 300) : rawJson;
            throw new RuntimeException("解析上游响应失败：" + snippet, e);
        }
        Object dataObj = raw.get("data");
        if (!(dataObj instanceof List<?> data)) { // 响应数据不是列表
            return items;
        }
        for (Object entry : data) { // 响应数据项
            if (!(entry instanceof Map<?, ?> map)) { // 响应数据项不是字典
                continue;
            }
            String revised = asString(map.get("revised_prompt")); // 响应数据项的修改提示
            Object b64 = map.get("b64_json"); // 响应数据项的图片数据
            Object url = map.get("url");// 响应数据项的图片URL
            if (b64 != null) {
                items.add(new GenerateResponse.ImageItem("b64_json", asString(b64), revised));
            } else if (url != null) {
                items.add(new GenerateResponse.ImageItem("url", asString(url), revised));
            }
        }
        return items;
    }
    // 响应数据项的图片数据转换成字符串
    private String asString(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static String firstNonBlank(String a, String b) {
        return StringUtils.hasText(a) ? a : b;
    }

    private static String stripTrailingSlashes(String s) {
        int end = s.length();
        while (end > 0 && s.charAt(end - 1) == '/') {
            end--;
        }
        return s.substring(0, end);
    }
}
