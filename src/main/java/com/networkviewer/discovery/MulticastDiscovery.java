package com.networkviewer.discovery;

import com.networkviewer.model.SystemInfo;
import java.io.IOException;
import java.net.DatagramPacket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.MulticastSocket;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONObject;

/**
 * Sends a multicast discovery request and collects JSON {@link SystemInfo} replies from agents on
 * the LAN.
 */
public final class MulticastDiscovery {

    private static final int RECEIVE_BUFFER = 65536;

    private MulticastDiscovery() {}

    public static List<SystemInfo> discover(int waitMillis) throws IOException {
        String groupHost = SystemInfo.NetworkInfo.MULTICAST_HOST;
        int port = SystemInfo.NetworkInfo.MULTICAST_PORT;
        String request = SystemInfo.NetworkInfo.DISCOVERY_REQUEST;

        InetAddress group = InetAddress.getByName(groupHost);
        byte[] reqBytes = request.getBytes(StandardCharsets.UTF_8);

        Set<SystemInfo> seen = new LinkedHashSet<>();
        int timeout = Math.max(300, waitMillis);

        try (MulticastSocket socket = new MulticastSocket(port)) {
            socket.setReuseAddress(true);
            socket.setTimeToLive(32);

            boolean joined = false;
            var nics =
                    NetworkInterface.networkInterfaces()
                            .filter(
                                    nic -> {
                                        try {
                                            return nic.isUp();
                                        } catch (SocketException e) {
                                            return false;
                                        }
                                    })
                            .toList();
            for (NetworkInterface nic : nics) {
                if (nic.isLoopback()) {
                    continue;
                }
                try {
                    socket.joinGroup(new InetSocketAddress(group, port), nic);
                    joined = true;
                } catch (Exception ignored) {
                    // try next
                }
            }
            if (!joined) {
                socket.joinGroup(group);
            }

            DatagramPacket out = new DatagramPacket(reqBytes, reqBytes.length, group, port);
            socket.send(out);

            long deadline = System.currentTimeMillis() + timeout;
            byte[] buf = new byte[RECEIVE_BUFFER];
            while (System.currentTimeMillis() < deadline) {
                int remaining = (int) Math.min(timeout, deadline - System.currentTimeMillis());
                if (remaining <= 0) {
                    break;
                }
                socket.setSoTimeout(Math.max(50, remaining));
                DatagramPacket in = new DatagramPacket(buf, buf.length);
                try {
                    socket.receive(in);
                } catch (java.net.SocketTimeoutException e) {
                    break;
                }
                String text =
                        new String(in.getData(), in.getOffset(), in.getLength(), StandardCharsets.UTF_8)
                                .trim();
                SystemInfo info = parseResponse(text);
                if (info != null) {
                    seen.add(info);
                }
            }
        }

        return new ArrayList<>(seen);
    }

    private static SystemInfo parseResponse(String text) {
        if (!text.startsWith("RSP:SystemInfo:v1")) {
            return null;
        }
        int jsonStart = text.indexOf('{');
        if (jsonStart < 0) {
            return null;
        }
        try {
            JSONObject o = new JSONObject(text.substring(jsonStart));
            return SystemInfo.fromJson(o, Instant.now());
        } catch (Exception e) {
            return null;
        }
    }
}
