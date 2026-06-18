package com.workbench.service;

import com.workbench.config.ImageProperties;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ImageGenerationServiceTest {

    private final ImageGenerationService service =
            new ImageGenerationService(RestClient.builder(), new ImageProperties());

    @Test
    void gptModelAppendsV1() {
        assertEquals("https://api.openai.com/v1/images/generations",
                service.resolveEndpoint("https://api.openai.com", "gpt-image-2"));
    }

    @Test
    void gptModelDoesNotDuplicateV1() {
        assertEquals("https://api.openai.com/v1/images/generations",
                service.resolveEndpoint("https://api.openai.com/v1", "gpt-image-2"));
    }

    @Test
    void trailingSlashIsStripped() {
        assertEquals("https://proxy.host/v1/images/generations",
                service.resolveEndpoint("https://proxy.host/", "gpt-image-1"));
    }

    @Test
    void nonGptModelDoesNotAppendV1() {
        assertEquals("https://proxy.host/images/generations",
                service.resolveEndpoint("https://proxy.host", "dall-e-3"));
    }

    @Test
    void nonGptKeepsExistingV1() {
        assertEquals("https://proxy.host/v1/images/generations",
                service.resolveEndpoint("https://proxy.host/v1", "dall-e-3"));
    }
}
