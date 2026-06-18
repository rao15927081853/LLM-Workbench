package com.workbench.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Optional server-side defaults for the image generation endpoint.
 * If the frontend supplies baseUrl / apiKey in the request, those take precedence.
 */
@Component
@ConfigurationProperties(prefix = "workbench.image")
public class ImageProperties {

    private String defaultBaseUrl = "";
    private String defaultApiKey = "";

    public String getDefaultBaseUrl() {
        return defaultBaseUrl;
    }

    public void setDefaultBaseUrl(String defaultBaseUrl) {
        this.defaultBaseUrl = defaultBaseUrl;
    }

    public String getDefaultApiKey() {
        return defaultApiKey;
    }

    public void setDefaultApiKey(String defaultApiKey) {
        this.defaultApiKey = defaultApiKey;
    }
}
