# ---- 构建阶段 ----
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
# 先单独拷 pom 以利用依赖缓存层
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q clean package -DskipTests

# ---- 运行阶段 ----
FROM eclipse-temurin:17-jre
WORKDIR /app
# 通配符避免硬编码版本号
COPY --from=build /app/target/llm-workbench-backend-*.jar app.jar
# 与 docker-compose 的 SERVER_PORT / nginx 反代目标 8081 保持一致
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
