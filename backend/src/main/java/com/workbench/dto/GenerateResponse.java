package com.workbench.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/** Normalized response returned to the frontend. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class GenerateResponse {

    /** Generated images, each either a base64 data string or a remote URL. */
    private List<ImageItem> images;

    /** The fully resolved endpoint that was called (for debugging in the UI). */
    private String resolvedEndpoint;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ImageItem {
        /** "b64_json" or "url". */
        private String type;
        /** The base64 payload or the URL value. */
        private String value;
        /** Optional revised prompt returned by some models. */
        private String revisedPrompt;
    }
}
