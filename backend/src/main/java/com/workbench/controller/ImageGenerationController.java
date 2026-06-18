package com.workbench.controller;

import com.workbench.dto.GenerateRequest;
import com.workbench.dto.GenerateResponse;
import com.workbench.service.ImageGenerationService;
import jakarta.validation.Valid;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/images")
@CrossOrigin(origins = "*")
public class ImageGenerationController {

    private final ImageGenerationService service;

    public ImageGenerationController(ImageGenerationService service) {
        this.service = service;
    }

    @PostMapping("/generate")
    public GenerateResponse generate(@Valid @RequestBody GenerateRequest request) {
        return service.generate(request);
    }

    /**
     * Image-to-image: accepts one or more uploaded reference images plus the same
     * params as text/generation, sent as multipart/form-data.
     */
    @PostMapping(value = "/edit", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public GenerateResponse edit(
            @RequestPart("images") List<MultipartFile> images,
            @RequestParam(required = false) String baseUrl,
            @RequestParam(required = false) String apiKey,
            @RequestParam String model,
            @RequestParam String prompt,
            @RequestParam(required = false) String size,
            @RequestParam(required = false) String quality,
            @RequestParam(required = false) Integer n,
            @RequestParam(required = false) String background,
            @RequestParam(required = false) String outputFormat) {

        GenerateRequest request = new GenerateRequest();
        request.setBaseUrl(baseUrl);
        request.setApiKey(apiKey);
        request.setModel(model);
        request.setPrompt(prompt);
        request.setSize(size);
        request.setQuality(quality);
        request.setN(n);
        request.setBackground(background);
        request.setOutputFormat(outputFormat);

        return service.edit(request, images);
    }

    /**
     * Download proxy: fetches a remote image URL server-side and returns it with an
     * attachment Content-Disposition so the browser saves it (bypasses cross-origin
     * restrictions that block client-side blob downloads).
     */
    @GetMapping("/download")
    public ResponseEntity<Resource> download(
            @RequestParam String url,
            @RequestParam(required = false) String filename) {

        ImageGenerationService.RemoteImage img = service.fetchRemote(url);

        String name = (filename == null || filename.isBlank()) ? "image" : filename;
        ContentDisposition disposition = ContentDisposition.attachment()
                .filename(name, StandardCharsets.UTF_8)
                .build();

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .contentType(MediaType.parseMediaType(img.contentType()))
                .body(img.resource());
    }
}


