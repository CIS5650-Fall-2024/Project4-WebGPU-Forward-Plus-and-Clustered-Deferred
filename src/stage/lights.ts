import { vec3 } from "wgpu-matrix";
import { device } from "../renderer";

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
    // add buffers for clusterSet
    static readonly numClusters = 16 * 9 * 24;
    static readonly numFloatsPerCluster = 512;
    
    clusterArray = new Float32Array(Lights.numClusters * Lights.numFloatsPerCluster);
    clusterSetStorageBuffer: GPUBuffer;

    clusterComputeBindGroupLayout: GPUBindGroupLayout;
    clusterComputeBindGroup: GPUBindGroup;
    computePipeline: GPUComputePipeline;  

    constructor(camera: Camera) {
        this.camera = camera;

        // TODO-2: add layouts, pipelines, textures, etc. needed for light clustering here
        this.clusterSetStorageBuffer = device.createBuffer({
            label: "cluster set buffer in light class",
            size: this.clusterArray.byteLength, // check pedding later
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
        });
        // this.populateClusterBuffer(); // not needed here, will be done in the renderer

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
        this.clusterComputeBindGroupLayout = device.createBindGroupLayout({
            label: "clusters compute bind group layout",
            entries: [
                { // lightSet
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                { // camera
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // clusterSet
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                }
            ]
        });

        this.clusterComputeBindGroup = device.createBindGroup({
            label: "clusters compute bind group",
            layout: this.clusterComputeBindGroupLayout,
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
                    resource: { buffer: this.clusterSetStorageBuffer }
                }
            ]
        });

        this.computePipeline = device.createComputePipeline({
            layout: device.createPipelineLayout({
                label: "Forward+ compute pipeline layout",
                bindGroupLayouts: [
                    this.clusterComputeBindGroupLayout
                ]
            }),
            //createShaderModule create the compute shader.
            //Pass the compute shader string to the code property
            compute: {
                module: device.createShaderModule({
                    label: "Forward+ compute shader",
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

    // TODO-2: add layouts, pipelines, textures, etc. needed for light clustering here
    private populateClusterBuffer() {
        device.queue.writeBuffer(this.clusterSetStorageBuffer, 0, this.clusterArray);
    }

    updateLightSetUniformNumLights() {
        device.queue.writeBuffer(this.lightSetStorageBuffer, 0, new Uint32Array([this.numLights]));
    }

    doLightClustering(encoder: GPUCommandEncoder) {
        // TODO-2: run the light clustering compute pass(es) here
        // implementing clustaering here allows for reusing the code in both Forward+ and Clustered Deferred
        const computePass = encoder.beginComputePass({label: "Forward+ compute pass begin"}); 
        computePass.setPipeline(this.computePipeline);
        computePass.setBindGroup(0, this.clusterComputeBindGroup);
        computePass.dispatchWorkgroups(
            // (16, 9 , 24) / (4, 4, 4) = (4, 3, 6)
            Math.ceil(shaders.constants.clusterXNum/shaders.constants.clusterWorkgroupSize[0]),
            Math.ceil(shaders.constants.clusterYNum/shaders.constants.clusterWorkgroupSize[1]),
            Math.ceil(shaders.constants.clusterZNum/shaders.constants.clusterWorkgroupSize[2]));
        computePass.end();
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
