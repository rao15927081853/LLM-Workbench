package com.workbench.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Request sent from the workbench frontend. baseUrl and apiKey are optional;
 * if omitted, server-side defaults (workbench.image.*) are used.
 */
@Data
public class GenerateRequest {

    /** Configurable endpoint base, e.g. "https://api.openai.com" or a proxy host. */
    private String baseUrl;

    /** API key. Sent as Bearer token. */
    private String apiKey;

    /** Model id, e.g. "gpt-image-2", "gpt-image-1", "dall-e-3". */
    @NotBlank
    private String model;

    /** The text prompt describing the desired image. */
    @NotBlank
    private String prompt;

    /** Image size, e.g. "1024x1024", "1536x1024", "1024x1536", "auto". */
    private String size;

    /** Quality, e.g. "low", "medium", "high", "auto" (gpt-image) or "standard"/"hd" (dall-e). */
    private String quality;

    /** Number of images to generate (1-10). */
    private Integer n;

    /** Optional background: "transparent", "opaque", "auto" (gpt-image). */
    private String background;

    /** Optional output format: "png", "jpeg", "webp" (gpt-image). */
    private String outputFormat;
}
