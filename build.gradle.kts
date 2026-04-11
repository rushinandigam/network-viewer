plugins {
    java
    application
    id("org.openjfx.javafxplugin") version "0.1.0"
    id("com.github.johnrengelman.shadow") version "8.1.1"
}

group = "com.networkviewer"
version = "1.0-SNAPSHOT"

repositories {
    mavenCentral()
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

dependencies {
    implementation("org.json:json:20240303")
    testImplementation(platform("org.junit:junit-bom:5.10.0"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

javafx {
    version = "21.0.5"
    modules("javafx.controls", "javafx.base", "javafx.graphics")
}

application {
    mainClass.set("com.networkviewer.NetworkViewerApp")
}

tasks.register<JavaExec>("runAgent") {
    group = "application"
    description = "Runs the small agent that advertises this machine to Network Viewer (multicast + HTTP)."
    classpath = sourceSets["main"].runtimeClasspath
    mainClass.set("com.networkviewer.agent.NetworkViewerAgent")
}

tasks.test {
    useJUnitPlatform()
}

tasks.shadowJar {
    archiveClassifier.set("all")
    mergeServiceFiles()
}
