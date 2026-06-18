package com.workbench.service;

import com.workbench.config.ImageProperties;
import com.workbench.dto.GenerateRequest;
import com.workbench.dto.GenerateResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

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

        String endpoint = resolveEndpoint(baseUrl, request.getModel());
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
     * Builds the final image-generation endpoint URL.
     * <p>
     * Rule: GPT-series models (model id starting with "gpt") require the OpenAI-style
     * "/v1" path segment. We append "/v1/images/generations" to the base host, taking care
     * not to duplicate "/v1" if the user already included it in the configured base URL.
     * Non-GPT models append "/images/generations" directly to the base.
     */
    String resolveEndpoint(String baseUrl, String model) {
        String base = stripTrailingSlashes(baseUrl.trim());

        boolean isGpt = model != null && model.trim().toLowerCase().startsWith("gpt");
        boolean alreadyVersioned = base.toLowerCase().endsWith("/v1");

        StringBuilder url = new StringBuilder(base);
        if (isGpt && !alreadyVersioned) {
            url.append("/v1");
        }
        // If a non-gpt base already ends with /v1 we keep it; just append the path.
        url.append("/images/generations");
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
