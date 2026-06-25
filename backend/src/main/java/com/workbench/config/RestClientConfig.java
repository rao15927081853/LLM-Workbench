package com.workbench.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;

@Configuration
public class RestClientConfig {

    /**
     * Image generation can take a while, so use generous timeouts.
     */
    @Bean
    public RestClient.Builder restClientBuilder() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(30).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(280).toMillis());
        return RestClient.builder().requestFactory(factory);
    }

    /**
     * Shared pool for fanning out multi-image requests. The upstream gateway ignores
     * {@code n>1} for image endpoints, so we issue N concurrent {@code n=1} calls and
     * merge the results. Bounded to 5 threads to cap concurrency (per product spec) and
     * to avoid overwhelming the upstream proxy. Daemon threads so they never block shutdown.
     */
    @Bean(destroyMethod = "shutdown")
    public ExecutorService imageFanoutExecutor() {
        ThreadFactory tf = new ThreadFactory() {
            private final AtomicInteger seq = new AtomicInteger(1);

            @Override
            public Thread newThread(Runnable r) {
                Thread t = new Thread(r, "img-fanout-" + seq.getAndIncrement());
                t.setDaemon(true);
                return t;
            }
        };
        return Executors.newFixedThreadPool(5, tf);
    }
}
