package com.networkviewer.service;

import com.networkviewer.model.SystemInfo;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpClient.Version;
import java.time.Duration;
import java.time.Instant;
import org.json.JSONObject;

/** Fetches {@code GET /system} from an agent HTTP endpoint. */
public final class SystemInfoClient {

    private static final Duration TIMEOUT = Duration.ofSeconds(5);

    private final HttpClient http =
            HttpClient.newBuilder()
                    .version(Version.HTTP_1_1)
                    .connectTimeout(TIMEOUT)
                    .build();

    public SystemInfo fetch(String host, int port) throws IOException, InterruptedException {
        String uri = "http://" + host + ":" + port + "/system";
        HttpRequest req =
                HttpRequest.newBuilder()
                        .uri(URI.create(uri))
                        .timeout(TIMEOUT)
                        .GET()
                        .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() / 100 != 2) {
            throw new IOException("HTTP " + res.statusCode() + " from " + uri);
        }
        JSONObject o = new JSONObject(res.body());
        return SystemInfo.fromJson(o, Instant.now());
    }
}
