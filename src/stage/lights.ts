import { vec3 } from "wgpu-matrix";
import { device, canvas } from "../renderer";

import * as shaders from '../shaders/shaders';
import { Camera } from "./camera";

// h in [0, 1]
function hueToRgb(h: number) {
    let f = (n: number, k = (n + h * 6) % 6) => 1 - Math.max(Math.min(k, 4 - k, 1), 0);
    return vec3.lerp(vec3.create(1, 1, 1), vec3.create(f(5), f(3), f(1)), 0.8);
}

export class Lights {
    private camera: Camera;

    numLights = 500;
    static readonly maxNumLights = 32000;
    static readonly numFloatsPerLight = 8; // vec3f is aligned at 16 byte boundaries

    static readonly lightIntensity = 0.1;

    lightsArray = new Float32Array(Lights.maxNumLights * Lights.numFloatsPerLight);
    lightSetStorageBuffer: GPUBuffer;

    timeUniformBuffer: GPUBuffer;

    moveLightsComputeBindGroupLayout: GPUBindGroupLayout;
    moveLightsComputeBindGroup: GPUBindGroup;
    moveLightsComputePipeline: GPUComputePipeline;

    // TODO-2: add layouts, pipelines, textures, etc. needed for light clustering here

    workgroupSize = shaders.constants.clusterLightsWorkgroupSize;
    numXClusters: number;
    numYClusters: number;
    numZClusters: number;
    numXClustersLaunch: number;
    numYClustersLaunch: number;
    numZClustersLaunch: number;
    clusterDataSize = (12 + shaders.constants.clusterMaxLights);
    clusterSetStorageBuffer: GPUBuffer;
    clusterBindGroupLayout: GPUBindGroupLayout;
    clusterBindGroup: GPUBindGroup;
    clusterPipeline: GPUComputePipeline;

    constructor(camera: Camera) {
        this.camera = camera;
        this.numXClusters = Math.ceil(canvas.width / shaders.constants.clusterSize);
        this.numYClusters = Math.ceil(canvas.height / shaders.constants.clusterSize);
        this.numZClusters = shaders.constants.numZBins;
        this.numXClustersLaunch = Math.ceil(this.numXClusters / shaders.constants.clusterLightsWorkgroupSize);
        this.numYClustersLaunch = Math.ceil(this.numYClusters / shaders.constants.clusterLightsWorkgroupSize);
        this.numZClustersLaunch = Math.ceil(this.numZClusters / shaders.constants.clusterLightsWorkgroupSize);

        this.lightSetStorageBuffer = device.createBuffer({
            label: "lights",
            size: 16 + this.lightsArray.byteLength, // 16 for numLights + padding
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.populateLightsBuffer();
        this.updateLightSetUniformNumLights();

        this.timeUniformBuffer = device.createBuffer({
            label: "time uniform",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.moveLightsComputeBindGroupLayout = device.createBindGroupLayout({
            label: "move lights compute bind group layout",
            entries: [
                { // lightSet
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                },
                { // time
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.moveLightsComputeBindGroup = device.createBindGroup({
            label: "move lights compute bind group",
            layout: this.moveLightsComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.timeUniformBuffer }
                }
            ]
        });

        this.moveLightsComputePipeline = device.createComputePipeline({
            label: "move lights compute pipeline",
            layout: device.createPipelineLayout({
                label: "move lights compute pipeline layout",
                bindGroupLayouts: [ this.moveLightsComputeBindGroupLayout ]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "move lights compute shader",
                    code: shaders.moveLightsComputeSrc
                }),
                entryPoint: "main"
            }
        });

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for light clustering here
        let clusterSetSize = this.numXClusters * this.numYClusters * this.numZClusters * this.clusterDataSize;
        clusterSetSize += 4; //add space for the 3 numClusters u32 values and 2 vec3f and some padding
        this.clusterSetStorageBuffer = device.createBuffer({
            label: "cluster set",
            size: clusterSetSize * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        const clusterData = new Uint32Array([this.numXClusters, this.numYClusters, this.numZClusters]);

        device.queue.writeBuffer(this.clusterSetStorageBuffer, 0, clusterData);


        this.clusterBindGroupLayout = device.createBindGroupLayout({
            label: "cluster bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                }, 
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.clusterBindGroup = device.createBindGroup({
            label: "cluster bind group",
            layout: this.clusterBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.clusterSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.camera.uniformsBuffer}
                },
            ]
        });

        const clusterModule = device.createShaderModule({
                    label: "light clustering compute shader",
                    code: shaders.clusteringComputeSrc
                });
        // Fetch the compilation info
        clusterModule.getCompilationInfo().then((info) => {
            if (info.messages.length > 0) {
                console.error("Shader compilation errors:");
                info.messages.forEach((message) => {
                    console.error(message.message);
                });
            }
        });

        console.log("Cluster Bind Group Layout:", this.clusterBindGroupLayout);

        // Log resources
        console.log("Light Set Storage Buffer:", this.lightSetStorageBuffer);
        console.log("Cluster Set Storage Buffer:", this.clusterSetStorageBuffer);
        console.log("Camera Uniforms Buffer:", this.camera.uniformsBuffer);
        
        this.clusterPipeline = device.createComputePipeline({
            label: "light clustering compute pipeline",
            layout: device.createPipelineLayout({
                label: "light clustering compute pipeline layout",
                bindGroupLayouts: [this.clusterBindGroupLayout ]
            }),
            compute: {
                module: clusterModule,
                entryPoint: "main"
            }
        });

    }

    private populateLightsBuffer() {
        for (let lightIdx = 0; lightIdx < Lights.maxNumLights; ++lightIdx) {
            // light pos is set by compute shader so no need to set it here
            const lightColor = vec3.scale(hueToRgb(Math.random()), Lights.lightIntensity);
            this.lightsArray.set(lightColor, (lightIdx * Lights.numFloatsPerLight) + 4);
        }

        device.queue.writeBuffer(this.lightSetStorageBuffer, 16, this.lightsArray);
    }

    updateLightSetUniformNumLights() {
        device.queue.writeBuffer(this.lightSetStorageBuffer, 0, new Uint32Array([this.numLights]));
    }

    doLightClustering(encoder: GPUCommandEncoder) {
        // TODO-2: run the light clustering compute pass(es) here
        // implementing clustering here allows for reusing the code in both Forward+ and Clustered Deferred
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.clusterPipeline);
        computePass.setBindGroup(0, this.clusterBindGroup);
        computePass.dispatchWorkgroups(this.numXClustersLaunch, this.numYClustersLaunch, this.numZClustersLaunch);
        computePass.end()
    }

    // CHECKITOUT: this is where the light movement compute shader is dispatched from the host
    onFrame(time: number) {
        device.queue.writeBuffer(this.timeUniformBuffer, 0, new Float32Array([time]));

        // not using same encoder as render pass so this doesn't interfere with measuring actual rendering performance
        const encoder = device.createCommandEncoder();

        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.moveLightsComputePipeline);
        computePass.setBindGroup(0, this.moveLightsComputeBindGroup);
        const workgroupCount = Math.ceil(this.numLights / shaders.constants.moveLightsWorkgroupSize);
        computePass.dispatchWorkgroups(workgroupCount);

        computePass.end();

        device.queue.submit([encoder.finish()]);
    }
}
