package com.workbench.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Optional server-side defaults for the image generation endpoint.
 * If the frontend supplies baseUrl / apiKey in the request, those take precedence.
 */
@Component
@ConfigurationProperties(prefix = "workbench.image")
@Data
public class ImageProperties {

    private String defaultBaseUrl = "";
    private String defaultApiKey = "";
}
