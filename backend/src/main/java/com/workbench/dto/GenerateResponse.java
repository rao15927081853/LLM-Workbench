package com.workbench.dto;

import java.util.List;

/** Normalized response returned to the frontend. */
public class GenerateResponse {

    /** Generated images, each either a base64 data string or a remote URL. */
    private List<ImageItem> images;

    /** The fully resolved endpoint that was called (for debugging in the UI). */
    private String resolvedEndpoint;

    public GenerateResponse() {
    }

    public GenerateResponse(List<ImageItem> images, String resolvedEndpoint) {
        this.images = images;
        this.resolvedEndpoint = resolvedEndpoint;
    }

    public List<ImageItem> getImages() {
        return images;
    }

    public void setImages(List<ImageItem> images) {
        this.images = images;
    }

    public String getResolvedEndpoint() {
        return resolvedEndpoint;
    }

    public void setResolvedEndpoint(String resolvedEndpoint) {
        this.resolvedEndpoint = resolvedEndpoint;
    }

    public static class ImageItem {
        /** "b64_json" or "url". */
        private String type;
        /** The base64 payload or the URL value. */
        private String value;
        /** Optional revised prompt returned by some models. */
        private String revisedPrompt;

        public ImageItem() {
        }

        public ImageItem(String type, String value, String revisedPrompt) {
            this.type = type;
            this.value = value;
            this.revisedPrompt = revisedPrompt;
        }

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public String getValue() {
            return value;
        }

        public void setValue(String value) {
            this.value = value;
        }

        public String getRevisedPrompt() {
            return revisedPrompt;
        }

        public void setRevisedPrompt(String revisedPrompt) {
            this.revisedPrompt = revisedPrompt;
        }
    }
}
