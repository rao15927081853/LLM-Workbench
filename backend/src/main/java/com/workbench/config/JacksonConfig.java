package com.workbench.config;

import com.fasterxml.jackson.core.json.JsonReadFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 让 JSON 解析容忍字符串中未转义的控制字符（如换行 \n、制表符 \t）。
 * 部分客户端或粘贴的提示词可能带有原始换行符，默认 Jackson 会抛 500，
 * 这里放宽以避免请求因换行而失败。
 */
@Configuration
public class JacksonConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer allowControlChars() {
        return builder -> builder.postConfigurer((ObjectMapper mapper) ->
                mapper.getFactory()
                        .configure(JsonReadFeature.ALLOW_UNESCAPED_CONTROL_CHARS.mappedFeature(), true));
    }
}
