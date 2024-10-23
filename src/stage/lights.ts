import { Vec2, vec2, Vec3, vec3 } from "wgpu-matrix";
import { device } from "../renderer";

import * as shaders from '../shaders/shaders';
import { Camera } from "./camera";

// h in [0, 1]
function hueToRgb(h: number) {
    let f = (n: number, k = (n + h * 6) % 6) => 1 - Math.max(Math.min(k, 4 - k, 1), 0);
    return vec3.lerp(vec3.create(1, 1, 1), vec3.create(f(5), f(3), f(1)), 0.8);
}

export class ClusterGridMetadata {
    readonly buffer = new ArrayBuffer(16 * 4); // 14 floats (4 bytes each) + 2 float padding at the end
    readonly array = new Uint32Array(this.buffer);

    set clusterGridSizeX(x: number) { this.array[0] = x; }
    get clusterGridSizeX() { return this.array[0]; }

    set clusterGridSizeY(y: number) { this.array[1] = y; }
    get clusterGridSizeY() { return this.array[1]; }

    set clusterGridSizeZ(z: number) { this.array[2] = z; }
    get clusterGridSizeZ() { return this.array[2]; }

    set canvasWidth(w: number) { this.array[3] = w; }
    get canvasWidth() { return this.array[3]; }

    set canvasHeight(h: number) { this.array[4] = h; }
    get canvasHeight() { return this.array[4]; }

    set numLights(n: number) { this.array[8] = n; }
    get numLights() { return this.array[8]; }

    set maxLightsPerCluster(n: number) { this.array[9] = n; }
    get maxLightsPerCluster() { return this.array[9]; }
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

    canvasWidth: number = 0;
    canvasHeight: number = 0;

    numDepthSlices = 16;
    clusterPixelSizeX = 256;
    clusterPixelSizeY = 256;

    numClusters: number = 0;
    bytesPerCluster: number = 0;
    clusterPixelDims: Vec2 = vec2.create(0, 0);
    clusterGridDims: Vec3 = vec3.create(0, 0, 0);
    clusterBufferSize: number = 0;
    clusterBuffer: GPUBuffer;
    clusteringBindGroupLayout: GPUBindGroupLayout;
    clusteringBindGroup: GPUBindGroup;
    clusteringPipeline: GPUComputePipeline;

    debugClusterBuffer: GPUBuffer;
    debugClusterBufferMapped: boolean = false;

    maxLightsPerCluster: number = 0;

    clusterGrid: ClusterGridMetadata;
    clusterGridBufferSize: number = 0;
    clusterGridBuffer: GPUBuffer;

    workgroupSize: number = 8;

    debug: boolean = false;

    perf: boolean = false;
    perfTotalLightsInAllClustersThisFrame: number = 0;
    perfAccumulatedTotalLights: number = 0;
    perfFrameCount: number = 0;
    perfAverageLightsPerClusterAcrossFrames: number = 0;

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

        this.calculateClusterSize();

        this.clusterBuffer = device.createBuffer({
            label: "cluster buffer",
            size: this.clusterBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });

        this.debugClusterBuffer = device.createBuffer({
            label: "debug cluster buffer",
            size: this.clusterBufferSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            mappedAtCreation: false
        });

        this.clusterGridBuffer = device.createBuffer({
            label: "cluster grid uniforms",
            size: this.clusterGridBufferSize, 
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: false
        });

        this.populateClusterGridBuffer();

        this.clusteringBindGroupLayout = device.createBindGroupLayout({
            label: "clustering bind group layout",
            entries: [
                {
                    // Lights.
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }
                },
                { 
                    // Clusters.
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                },
                { 
                    // Cluster grid.
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                {
                    // Camera.
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.clusteringBindGroup = device.createBindGroup({
            label: "clustering bind group",
            layout: this.clusteringBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.clusterBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.clusterGridBuffer }
                },
                {
                    binding: 3,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
            ]
        });

        this.clusteringPipeline = device.createComputePipeline({
            label: "clustering pipeline",
            layout: device.createPipelineLayout({
                bindGroupLayouts: [this.clusteringBindGroupLayout]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "clustering compute shader",
                    code: shaders.clusteringComputeSrc
                })
            }
        });
    }

    private calculateClusterSize() {
        const canvas = document.getElementById("mainCanvas") as HTMLCanvasElement;
        canvas.width = canvas.clientWidth * window.devicePixelRatio;
        canvas.height = canvas.clientHeight * window.devicePixelRatio;

        this.canvasWidth = canvas.width;
        this.canvasHeight = canvas.height;

        this.clusterPixelDims = vec2.create(this.clusterPixelSizeX, this.clusterPixelSizeY);

        this.clusterGridDims = vec3.create(
            Math.ceil(this.canvasWidth / this.clusterPixelDims[0]),
            Math.ceil(this.canvasHeight / this.clusterPixelDims[1]),
            this.numDepthSlices
        )

        this.numClusters = this.clusterGridDims[0] * this.clusterGridDims[1] * this.clusterGridDims[2];

        this.maxLightsPerCluster = shaders.constants.maxLightsPerCluster;
        // Size of u32 in bytes.
        const bytesPerLightIndex = 4;
        // Number of lights (u32, 4 bytes) followed by light indices.
        this.bytesPerCluster = 4 + (this.maxLightsPerCluster * bytesPerLightIndex);

        this.clusterBufferSize = this.numClusters * this.bytesPerCluster;
        if (this.debug) {
            console.log(`clusterBufferSize: ${this.clusterBufferSize}`);
        }

        this.clusterGrid = new ClusterGridMetadata();
        this.clusterGrid.clusterGridSizeX = this.clusterGridDims[0];
        this.clusterGrid.clusterGridSizeY = this.clusterGridDims[1];
        this.clusterGrid.clusterGridSizeZ = this.clusterGridDims[2];
        this.clusterGrid.canvasWidth = this.canvasWidth;
        this.clusterGrid.canvasHeight = this.canvasHeight;
        this.clusterGrid.numLights = this.numLights;
        this.clusterGrid.maxLightsPerCluster = this.maxLightsPerCluster;

        this.clusterGridBufferSize = this.clusterGrid.buffer.byteLength;
        if (this.debug) {
            console.log(`clusterGrid: ${this.clusterGrid}`);
        }
    }

    private populateClusterGridBuffer() {
        if (this.debug) {
            console.log(`clusterGridData: array: ${this.clusterGrid.array} byteLength: ${this.clusterGrid.buffer.byteLength}`);
        }

        device.queue.writeBuffer(this.clusterGridBuffer, 0, this.clusterGrid.buffer, 0, this.clusterGrid.buffer.byteLength);
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

    doLightClustering(encoder: GPUCommandEncoder, querySet: GPUQuerySet|null = null) {
        // TODO-2: run the light clustering compute pass(es) here
        // implementing clustering here allows for reusing the code in both Forward+ and Clustered Deferred
        const computePass = encoder.beginComputePass();

        if (querySet) {
            computePass.writeTimestamp(querySet, 0);
        }

        computePass.setPipeline(this.clusteringPipeline);
        computePass.setBindGroup(shaders.constants.bindGroup_scene, this.clusteringBindGroup);

        const numWorkgroupsX = Math.ceil(this.clusterGridDims[0] / 8);
        const numWorkgroupsY = Math.ceil(this.clusterGridDims[1] / 4);
        const numWorkgroupsZ = Math.ceil(this.clusterGridDims[2] / 8);
        if (this.debug) {
            console.log(`Dispatching workgroups: x=${numWorkgroupsX}, y=${numWorkgroupsY}, z=${numWorkgroupsZ}`);
        }
        computePass.dispatchWorkgroups(numWorkgroupsX, numWorkgroupsY, numWorkgroupsZ);
        
        if (querySet) {
            computePass.writeTimestamp(querySet, 1);
        }

        computePass.end();

        encoder.copyBufferToBuffer(this.clusterBuffer, 0, this.debugClusterBuffer, 0, this.clusterBufferSize);
    }

    getClusterBuffer() {
        return this.clusterBuffer;
    }
    
    getClusterGridBuffer() {
        return this.clusterGridBuffer
    }

    async readClusterBuffer() {
        if (this.debugClusterBufferMapped) return;

        this.debugClusterBufferMapped = true;
        await this.debugClusterBuffer.mapAsync(GPUMapMode.READ);
    
        const arrayBuffer = this.debugClusterBuffer.getMappedRange();
        const clusterF32Data = new Float32Array(arrayBuffer);
        const clusterUintData = new Uint32Array(arrayBuffer);
    
        if (this.debug) {
            console.log(`debugClusterBuffer.byteLength: ${clusterF32Data.byteLength}`);
            console.log(`debugClusterBuffer.length: ${clusterF32Data.byteLength}/4 = ${clusterF32Data.byteLength/4} = ${clusterF32Data.length}`);
            console.log(clusterF32Data);
            for (let i = 0; i < Math.min(129*this.numClusters, clusterF32Data.length); i++) {
                console.log(clusterF32Data[i]);
            }

            console.log(`debugClusterBuffer.byteLength: ${clusterUintData.byteLength}`);
            console.log(`debugClusterBuffer.length: ${clusterUintData.byteLength}/4 = ${clusterUintData.byteLength/4} = ${clusterUintData.length}`);
            for (let i = 0; i < clusterUintData.length; i += 129) {
                console.log(clusterUintData.slice(i, i + 10));
            }
            for (let i = 0; i < Math.min(257*this.numClusters, clusterUintData.length); i+=256) {
                console.log(clusterUintData[i]);
            }
        }

        if (this.perf) {
            for (let i = 0; i < clusterUintData.length; i += shaders.constants.maxLightsPerCluster) {
                let numLights = clusterUintData[i];
                this.perfTotalLightsInAllClustersThisFrame += numLights;
            }

            this.perfAccumulatedTotalLights += this.perfTotalLightsInAllClustersThisFrame;
            this.perfFrameCount += 1;

            this.perfAverageLightsPerClusterAcrossFrames = (this.perfAccumulatedTotalLights / this.perfFrameCount) / this.numClusters;
            console.log(`Average lights per cluster (${this.perfFrameCount}): ${this.perfAverageLightsPerClusterAcrossFrames}`);

            this.perfTotalLightsInAllClustersThisFrame = 0;
        }
    
        this.debugClusterBuffer.unmap();
        this.debugClusterBufferMapped = false;
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
