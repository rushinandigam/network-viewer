package com.networkviewer;

import com.networkviewer.discovery.MulticastDiscovery;
import com.networkviewer.model.SystemInfo;
import com.networkviewer.service.SystemInfoClient;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.ButtonType;
import javafx.scene.control.Dialog;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressIndicator;
import javafx.scene.control.SplitPane;
import javafx.scene.control.TableColumn;
import javafx.scene.control.TableView;
import javafx.scene.control.TextArea;
import javafx.scene.control.TextField;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.HBox;
import javafx.stage.Stage;
import javafx.beans.property.ReadOnlyObjectWrapper;

/**
 * Desktop client: discovers machines running {@link com.networkviewer.agent.NetworkViewerAgent} and
 * shows their system details. Use "Add host" when multicast is blocked.
 */
public class NetworkViewerApp extends Application {

    private static final DateTimeFormatter TIME =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneId.systemDefault());

    private final ObservableList<SystemInfo> rows = FXCollections.observableArrayList();
    private final SystemInfoClient client = new SystemInfoClient();
    private TextArea detailArea;
    private ProgressIndicator busy;
    private TableView<SystemInfo> table;

    @Override
    public void start(Stage stage) {
        stage.setTitle("Network Viewer");

        table = new TableView<>(rows);
        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_FLEX_LAST_COLUMN);

        TableColumn<SystemInfo, String> hostCol = new TableColumn<>("Hostname");
        hostCol.setCellValueFactory(
                c -> new ReadOnlyObjectWrapper<>(c.getValue().hostname()));

        TableColumn<SystemInfo, String> osCol = new TableColumn<>("OS");
        osCol.setCellValueFactory(
                c ->
                        new ReadOnlyObjectWrapper<>(
                                c.getValue().osName() + " " + c.getValue().osVersion()));

        TableColumn<SystemInfo, String> addrCol = new TableColumn<>("IPv4");
        addrCol.setCellValueFactory(
                c -> new ReadOnlyObjectWrapper<>(String.join(", ", c.getValue().ipv4Addresses())));

        TableColumn<SystemInfo, String> portCol = new TableColumn<>("HTTP");
        portCol.setMaxWidth(80);
        portCol.setCellValueFactory(
                c -> new ReadOnlyObjectWrapper<>(String.valueOf(c.getValue().httpPort())));

        TableColumn<SystemInfo, String> mouseTcpCol = new TableColumn<>("Mouse TCP");
        mouseTcpCol.setMaxWidth(90);
        mouseTcpCol.setCellValueFactory(
                c -> {
                    int p = c.getValue().mobileMouseTcpPort();
                    return new ReadOnlyObjectWrapper<>(p >= 0 ? String.valueOf(p) : "—");
                });

        TableColumn<SystemInfo, String> seenCol = new TableColumn<>("Last seen");
        seenCol.setCellValueFactory(
                c -> new ReadOnlyObjectWrapper<>(TIME.format(c.getValue().lastSeen())));

        table.getColumns().setAll(List.of(hostCol, osCol, addrCol, portCol, mouseTcpCol, seenCol));

        detailArea = new TextArea();
        detailArea.setEditable(false);
        detailArea.setWrapText(true);
        detailArea.setPromptText("Select a system to see JSON details…");

        table.getSelectionModel()
                .selectedItemProperty()
                .addListener(
                        (obs, old, sel) -> {
                            if (sel == null) {
                                detailArea.clear();
                                return;
                            }
                            detailArea.setText(sel.toJson().toString(2));
                        });

        SplitPane split = new SplitPane(table, detailArea);
        split.setDividerPositions(0.55);

        Button scan = new Button("Scan network");
        scan.setOnAction(e -> runScan());

        Button add = new Button("Add host…");
        add.setOnAction(e -> showAddHostDialog());

        Button refresh = new Button("Refresh selected");
        refresh.setOnAction(
                e -> {
                    SystemInfo row = table.getSelectionModel().getSelectedItem();
                    if (row != null) {
                        refreshOne(row);
                    }
                });

        busy = new ProgressIndicator();
        busy.setVisible(false);
        busy.setMaxSize(28, 28);

        HBox tools = new HBox(10, scan, add, refresh, busy);
        tools.setPadding(new Insets(8));

        BorderPane root = new BorderPane();
        root.setTop(tools);
        root.setCenter(split);

        Scene scene = new Scene(root, 960, 600);
        stage.setScene(scene);
        stage.show();
    }

    private void runScan() {
        busy.setVisible(true);
        Thread.startVirtualThread(
                () -> {
                    try {
                        List<SystemInfo> found = MulticastDiscovery.discover(3000);
                        Platform.runLater(
                                () -> {
                                    mergeResults(found);
                                    busy.setVisible(false);
                                });
                    } catch (Exception ex) {
                        Platform.runLater(
                                () -> {
                                    busy.setVisible(false);
                                    alert(Alert.AlertType.ERROR, "Scan failed", ex.getMessage());
                                });
                    }
                });
    }

    private void mergeResults(List<SystemInfo> found) {
        for (SystemInfo s : found) {
            upsert(s);
        }
    }

    private void upsert(SystemInfo incoming) {
        for (int i = 0; i < rows.size(); i++) {
            if (rows.get(i).equals(incoming)) {
                rows.set(i, incoming);
                return;
            }
        }
        rows.add(incoming);
    }

    private void refreshOne(SystemInfo ref) {
        String host = ref.ipv4Addresses().isEmpty() ? "127.0.0.1" : ref.ipv4Addresses().getFirst();
        busy.setVisible(true);
        Thread.startVirtualThread(
                () -> {
                    try {
                        SystemInfo updated = client.fetch(host, ref.httpPort());
                        Platform.runLater(
                                () -> {
                                    upsert(updated);
                                    busy.setVisible(false);
                                });
                    } catch (Exception ex) {
                        Platform.runLater(
                                () -> {
                                    busy.setVisible(false);
                                    alert(Alert.AlertType.ERROR, "Refresh failed", ex.getMessage());
                                });
                    }
                });
    }

    private void showAddHostDialog() {
        Dialog<ButtonType> dialog = new Dialog<>();
        dialog.setTitle("Add host");
        dialog.getDialogPane().getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);

        TextField host = new TextField();
        host.setPromptText("Hostname or IP");
        TextField port = new TextField(String.valueOf(SystemInfo.NetworkInfo.DEFAULT_HTTP_PORT));
        port.setPromptText("HTTP port");

        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(8);
        grid.addRow(0, new Label("Host:"), host);
        grid.addRow(1, new Label("Port:"), port);
        dialog.getDialogPane().setContent(grid);

        dialog.setResultConverter(b -> b == ButtonType.OK ? ButtonType.OK : ButtonType.CANCEL);

        dialog.showAndWait()
                .filter(r -> r == ButtonType.OK)
                .ifPresent(
                        r -> {
                            try {
                                int p = Integer.parseInt(port.getText().trim());
                                String h = host.getText().trim();
                                if (h.isEmpty()) {
                                    return;
                                }
                                busy.setVisible(true);
                                Thread.startVirtualThread(
                                        () -> {
                                            try {
                                                SystemInfo info = client.fetch(h, p);
                                                Platform.runLater(
                                                        () -> {
                                                            upsert(info);
                                                            busy.setVisible(false);
                                                        });
                                            } catch (Exception ex) {
                                                Platform.runLater(
                                                        () -> {
                                                            busy.setVisible(false);
                                                            alert(
                                                                    Alert.AlertType.ERROR,
                                                                    "Could not reach host",
                                                                    ex.getMessage());
                                                        });
                                            }
                                        });
                            } catch (NumberFormatException ex) {
                                alert(Alert.AlertType.ERROR, "Invalid port", ex.getMessage());
                            }
                        });
    }

    private static void alert(Alert.AlertType type, String title, String msg) {
        Alert a = new Alert(type, msg, ButtonType.OK);
        a.setHeaderText(title);
        a.showAndWait();
    }

    public static void main(String[] args) {
        launch(args);
    }
}
