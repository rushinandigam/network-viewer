package com.networkviewer.model;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Objects;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Describes a machine reachable on the LAN (from an agent response or HTTP {@code /system}).
 */
public final class SystemInfo {

    public static final String PROTOCOL_VERSION = "1";

    private final String hostname;
    private final String osName;
    private final String osVersion;
    private final List<String> ipv4Addresses;
    private final int httpPort;
    /** Mobile Mouse JSON/TCP control port when this host runs that app; {@code -1} if unknown. */
    private final int mobileMouseTcpPort;
    private final Instant lastSeen;

    public SystemInfo(
            String hostname,
            String osName,
            String osVersion,
            List<String> ipv4Addresses,
            int httpPort,
            int mobileMouseTcpPort,
            Instant lastSeen) {
        this.hostname = Objects.requireNonNullElse(hostname, "unknown");
        this.osName = Objects.requireNonNullElse(osName, "");
        this.osVersion = Objects.requireNonNullElse(osVersion, "");
        this.ipv4Addresses = List.copyOf(ipv4Addresses != null ? ipv4Addresses : List.of());
        this.httpPort = httpPort;
        this.mobileMouseTcpPort = mobileMouseTcpPort;
        this.lastSeen = lastSeen != null ? lastSeen : Instant.now();
    }

    public String hostname() {
        return hostname;
    }

    public String osName() {
        return osName;
    }

    public String osVersion() {
        return osVersion;
    }

    public List<String> ipv4Addresses() {
        return ipv4Addresses;
    }

    public int httpPort() {
        return httpPort;
    }

    /** TCP port for Mobile Mouse control JSON, or {@code -1} if not applicable. */
    public int mobileMouseTcpPort() {
        return mobileMouseTcpPort;
    }

    public Instant lastSeen() {
        return lastSeen;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof SystemInfo that)) {
            return false;
        }
        return httpPort == that.httpPort
                && mobileMouseTcpPort == that.mobileMouseTcpPort
                && hostname.equals(that.hostname)
                && ipv4Addresses.equals(that.ipv4Addresses);
    }

    @Override
    public int hashCode() {
        return Objects.hash(hostname, ipv4Addresses, httpPort, mobileMouseTcpPort);
    }

    public JSONObject toJson() {
        JSONObject o = new JSONObject();
        o.put("protocolVersion", PROTOCOL_VERSION);
        o.put("hostname", hostname);
        o.put("osName", osName);
        o.put("osVersion", osVersion);
        o.put("httpPort", httpPort);
        if (mobileMouseTcpPort >= 0) {
            o.put("mobileMouseTcpPort", mobileMouseTcpPort);
        }
        JSONArray addrs = new JSONArray();
        for (String a : ipv4Addresses) {
            addrs.put(a);
        }
        o.put("ipv4Addresses", addrs);
        return o;
    }

    public static SystemInfo fromJson(JSONObject o, Instant lastSeen) {
        List<String> addrs = new ArrayList<>();
        if (o.has("ipv4Addresses") && o.get("ipv4Addresses") instanceof JSONArray arr) {
            for (int i = 0; i < arr.length(); i++) {
                addrs.add(arr.getString(i));
            }
        }
        return new SystemInfo(
                o.optString("hostname", "unknown"),
                o.optString("osName", ""),
                o.optString("osVersion", ""),
                addrs,
                o.optInt("httpPort", NetworkInfo.DEFAULT_HTTP_PORT),
                o.optInt("mobileMouseTcpPort", -1),
                lastSeen);
    }

    /** Snapshot of this JVM host for the standalone agent (no Mobile Mouse TCP port). */
    public static SystemInfo currentMachine(int httpPort) {
        return currentMachine(httpPort, -1);
    }

    public static SystemInfo currentMachine(int httpPort, int mobileMouseTcpPort) {
        return new SystemInfo(
                safeHostname(),
                System.getProperty("os.name", ""),
                System.getProperty("os.version", ""),
                localIpv4Addresses(),
                httpPort,
                mobileMouseTcpPort,
                Instant.now());
    }

    private static String safeHostname() {
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (Exception e) {
            return "unknown";
        }
    }

    private static List<String> localIpv4Addresses() {
        List<String> out = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> nics = NetworkInterface.getNetworkInterfaces();
            while (nics.hasMoreElements()) {
                NetworkInterface nic = nics.nextElement();
                if (!nic.isUp() || nic.isLoopback()) {
                    continue;
                }
                Enumeration<InetAddress> addrs = nic.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress a = addrs.nextElement();
                    if (a instanceof Inet4Address) {
                        out.add(a.getHostAddress());
                    }
                }
            }
        } catch (Exception ignored) {
            // leave empty
        }
        Collections.sort(out);
        return out;
    }

    /** Network-related defaults shared with UI and agent. */
    public static final class NetworkInfo {
        public static final String MULTICAST_HOST = "239.255.42.42";
        public static final int MULTICAST_PORT = 45454;
        public static final String DISCOVERY_REQUEST = "REQ:SystemInfo:v1\n";
        public static final int DEFAULT_HTTP_PORT = 18765;

        private NetworkInfo() {}
    }
}
