import { vec3 } from "wgpu-matrix";
import { canvas, device } from "../renderer";

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
    static readonly maxNumLights = 5000;
    static readonly numFloatsPerLight = 8; // vec3f is aligned at 16 byte boundaries

    static readonly lightIntensity = 0.1;

    lightsArray = new Float32Array(Lights.maxNumLights * Lights.numFloatsPerLight);
    lightSetStorageBuffer: GPUBuffer;

    timeUniformBuffer: GPUBuffer;

    moveLightsComputeBindGroupLayout: GPUBindGroupLayout;
    moveLightsComputeBindGroup: GPUBindGroup;
    moveLightsComputePipeline: GPUComputePipeline;

    // TODO-2: add layouts, pipelines, textures, etc. needed for light clustering here
    numClusters = Math.ceil(canvas.height / shaders.constants.clusterTileSize_X) * Math.ceil(canvas.width / shaders.constants.clusterTileSize_Y) * Math.ceil(Camera.farPlane / shaders.constants.clusterTileSize_Z);
    static readonly maxNumClusters = 4096;
    static readonly numFloatsPerClusteer = 12 + 1988; // 4 bytes for each light, (500 - 3) * 4 = 1988)

    clustersArray = new Float32Array(Lights.maxNumClusters * Lights.numFloatsPerClusteer); // 112 bytes for each cluster
    clustersSetStorageBuffer: GPUBuffer;
    lightCullingComputeBindGroupLayout: GPUBindGroupLayout;
    lightCullingComputeBindGroup: GPUBindGroup;
    lightCullingComputePipeline: GPUComputePipeline;

    constructor(camera: Camera) {
        this.camera = camera;

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
        this.clustersSetStorageBuffer = device.createBuffer({
            label: "clusters",
            size: 16 + this.clustersArray.byteLength, // 16 for numClusters + padding
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        this.populateClustersBuffer();

        this.lightCullingComputeBindGroupLayout = device.createBindGroupLayout({
            label: "light culling compute bind group layout",
            entries: [
                { // lightSet
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                },
                { // camera
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // clusters
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                }
            ]
        });

        this.lightCullingComputeBindGroup = device.createBindGroup({
            label: "light culling compute bind group",
            layout: this.lightCullingComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.clustersSetStorageBuffer }
                }
            ]
        });

        this.lightCullingComputePipeline = device.createComputePipeline({
            label: "light culling compute pipeline",
            layout: device.createPipelineLayout({
                label: "light culling compute pipeline layout",
                bindGroupLayouts: [ this.lightCullingComputeBindGroupLayout ]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "light culling compute shader",
                    code: shaders.clusteringComputeSrc
                }),
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

    populateClustersBuffer() {
        // set the clusters buffer to 0
        this.clustersArray.fill(0);

        device.queue.writeBuffer(this.clustersSetStorageBuffer, 0, new Uint32Array([this.numClusters]));
        device.queue.writeBuffer(this.clustersSetStorageBuffer, 16, this.clustersArray);
    }

    updateLightSetUniformNumLights() {
        device.queue.writeBuffer(this.lightSetStorageBuffer, 0, new Uint32Array([this.numLights]));
    }

    doLightClustering(encoder: GPUCommandEncoder) {
        // TODO-2: run the light clustering compute pass(es) here
        // implementing clustering here allows for reusing the code in both Forward+ and Clustered Deferred
        
        const lightCullingComputePass = encoder.beginComputePass({ label: "light culling compute pass" });
        lightCullingComputePass.setPipeline(this.lightCullingComputePipeline);
        lightCullingComputePass.setBindGroup(0, this.lightCullingComputeBindGroup);

        // // #working groups = #clusters / workgroup size
        const rowNum = Math.ceil(canvas.height / shaders.constants.clusterTileSize_X);
        const colNum = Math.ceil(canvas.width / shaders.constants.clusterTileSize_Y);
        const sliceNum = Math.ceil(Camera.farPlane / shaders.constants.clusterTileSize_Z);
        //const workgroupCount =Math.ceil( rowNum * colNum * sliceNum / shaders.constants.clusterComputeWorkgroupSize);
        const workgroupCount = Math.ceil( this.camera.tileSize / shaders.constants.clusterComputeWorkgroupSize) | 0;
        //console.log("workgroupCount: " + workgroupCount);
        lightCullingComputePass.dispatchWorkgroups(workgroupCount);

        lightCullingComputePass.end();

        device.queue.submit([encoder.finish()]);
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
