package com.workbench.service;

import com.workbench.config.ImageProperties;
import com.workbench.dto.GenerateRequest;
import com.workbench.dto.GenerateResponse;
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

@Service
public class ImageGenerationService {

    private static final Logger log = LoggerFactory.getLogger(ImageGenerationService.class);

    private final RestClient.Builder restClientBuilder;
    private final ImageProperties properties;

    public ImageGenerationService(RestClient.Builder restClientBuilder, ImageProperties properties) {
        this.restClientBuilder = restClientBuilder;
        this.properties = properties;
    }

    public GenerateResponse generate(GenerateRequest request) {
        String baseUrl = firstNonBlank(request.getBaseUrl(), properties.getDefaultBaseUrl());
        String apiKey = firstNonBlank(request.getApiKey(), properties.getDefaultApiKey());

        if (!StringUtils.hasText(baseUrl)) {
            throw new IllegalArgumentException("请求地址 (baseUrl) 未配置");
        }
        if (!StringUtils.hasText(apiKey)) {
            throw new IllegalArgumentException("API Key 未配置");
        }

        String endpoint = resolveEndpoint(baseUrl, request.getModel(), "/images/generations");
        Map<String, Object> body = buildBody(request);

        log.info("Calling image endpoint {} with model {}", endpoint, request.getModel());

        RestClient client = restClientBuilder.build();
        @SuppressWarnings("unchecked")
        Map<String, Object> raw = client.post()
                .uri(endpoint)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(Map.class);

        return new GenerateResponse(parseImages(raw), endpoint);
    }

    /**
     * Image-to-image: forwards uploaded reference images plus prompt/params to the
     * upstream "/images/edits" endpoint as multipart/form-data. Supports 1 or more images
     * (the {@code image[]} repeated field, per the gpt-image-1 multi-image contract).
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

        String endpoint = resolveEndpoint(baseUrl, request.getModel(), "/images/edits");

        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("model", request.getModel());
        form.add("prompt", request.getPrompt());
        if (StringUtils.hasText(request.getSize())) {
            form.add("size", request.getSize());
        }
        if (StringUtils.hasText(request.getQuality())) {
            form.add("quality", request.getQuality());
        }
        if (request.getN() != null && request.getN() > 0) {
            form.add("n", String.valueOf(request.getN()));
        }
        if (StringUtils.hasText(request.getBackground())) {
            form.add("background", request.getBackground());
        }
        if (StringUtils.hasText(request.getOutputFormat())) {
            form.add("output_format", request.getOutputFormat());
        }
        for (MultipartFile file : images) {
            form.add("image[]", toResource(file));
        }

        log.info("Calling image edits endpoint {} with model {} and {} image(s)",
                endpoint, request.getModel(), images.size());

        RestClient client = restClientBuilder.build();
        @SuppressWarnings("unchecked")
        Map<String, Object> raw = client.post()
                .uri(endpoint)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(form)
                .retrieve()
                .body(Map.class);

        return new GenerateResponse(parseImages(raw), endpoint);
    }

    /** Wraps an uploaded file as a named Resource so RestClient sends a proper file part. */
    private Resource toResource(MultipartFile file) {
        String filename = StringUtils.hasText(file.getOriginalFilename())
                ? file.getOriginalFilename()
                : "image.png";
        try {
            return new ByteArrayResource(file.getBytes()) {
                @Override
                public String getFilename() {
                    return filename;
                }
            };
        } catch (IOException e) {
            throw new UncheckedIOException("读取上传图片失败: " + filename, e);
        }
    }

    /** Fetched remote image bytes plus its content type, for the download proxy. */
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
        if (request.getN() != null && request.getN() > 0) {
            body.put("n", request.getN());
        }
        if (StringUtils.hasText(request.getBackground())) {
            body.put("background", request.getBackground());
        }
        if (StringUtils.hasText(request.getOutputFormat())) {
            body.put("output_format", request.getOutputFormat());
        }
        return body;
    }

    @SuppressWarnings("unchecked")
    private List<GenerateResponse.ImageItem> parseImages(Map<String, Object> raw) {
        List<GenerateResponse.ImageItem> items = new ArrayList<>();
        if (raw == null) {
            return items;
        }
        Object dataObj = raw.get("data");
        if (!(dataObj instanceof List<?> data)) {
            return items;
        }
        for (Object entry : data) {
            if (!(entry instanceof Map<?, ?> map)) {
                continue;
            }
            String revised = asString(map.get("revised_prompt"));
            Object b64 = map.get("b64_json");
            Object url = map.get("url");
            if (b64 != null) {
                items.add(new GenerateResponse.ImageItem("b64_json", asString(b64), revised));
            } else if (url != null) {
                items.add(new GenerateResponse.ImageItem("url", asString(url), revised));
            }
        }
        return items;
    }

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
