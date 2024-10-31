import { vec3, vec2 } from "wgpu-matrix";
import { device, canvas} from "../renderer";

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
    // webgpu related
    clusteringComputeBindGroupLayout: GPUBindGroupLayout;
    clusteringComputeBindGroup: GPUBindGroup;
    clusteringComputePipeline: GPUComputePipeline;
    // cluster param
    screenDimensions = vec2.fromValues(canvas.width, canvas.height);
    static readonly clusterPerDim = 16;
    static readonly maxLightsPerCluster = 5000;
    // cluster data
    static readonly numFloatsPerCluster = Lights.maxLightsPerCluster + 1; // each indices is just index
    static readonly clusterArraySize = Lights.clusterPerDim * Lights.clusterPerDim * Lights.clusterPerDim;
    clusterSetStorageBuffer: GPUBuffer;

    maxLightsPerClusterUniformBuffer: GPUBuffer;
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

        this.maxLightsPerClusterUniformBuffer = device.createBuffer({
            label: "max lights per cluster uniform",
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
        this.clusterSetStorageBuffer = device.createBuffer({
            label: "cluster set storage buffer",
            size: Lights.clusterArraySize * Lights.numFloatsPerCluster * 4, // each float is 4 bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
        });
        this.createCleanDeviceClusterArray();
        this.clusteringComputeBindGroupLayout = device.createBindGroupLayout({
            label: "clustering compute bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // inverse proj mat
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // inverse view mat
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                },
                { // clusterSet
                    binding: 4,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                }
            ]
        });

        this.clusteringComputeBindGroup = device.createBindGroup({
            label: "clustering compute bind group",
            layout: this.clusteringComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.maxLightsPerClusterUniformBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.camera.uniformsInverseProjBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.camera.uniformsInverseViewBuffer }
                },
                {
                    binding: 3,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 4,
                    resource: { buffer: this.clusterSetStorageBuffer }
                }
            ]
        });

        this.clusteringComputePipeline = device.createComputePipeline({
            label: "clustering compute pipeline",
            layout: device.createPipelineLayout({
                label: "clustering compute pipeline layout",
                bindGroupLayouts: [ this.clusteringComputeBindGroupLayout ]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "clustering compute shader",
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

    updateLightSetUniformNumLights() {
        device.queue.writeBuffer(this.lightSetStorageBuffer, 0, new Uint32Array([this.numLights]));
    }

    updateMaxLightsPerClusterUniform() {
        device.queue.writeBuffer(this.maxLightsPerClusterUniformBuffer, 0, new Uint32Array([Lights.maxLightsPerCluster]));
    }
    
    createCleanDeviceClusterArray() {
        device.queue.writeBuffer(this.clusterSetStorageBuffer, 0, new Float32Array(Lights.clusterArraySize * Lights.numFloatsPerCluster));
    }

    doLightClustering(encoder: GPUCommandEncoder) {
        // TODO-2: run the light clustering compute pass(es) here
        // implementing clustering here allows for reusing the code in both Forward+ and Clustered Deferred
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.clusteringComputePipeline);
        computePass.setBindGroup(0, this.clusteringComputeBindGroup);
        const workgroupCount = Math.ceil(Math.pow(Lights.clusterPerDim, 3) / shaders.constants.moveLightsWorkgroupSize);
        computePass.dispatchWorkgroups(workgroupCount);
        computePass.end();

        var logFlag = false ;

        if (logFlag) {
            readClusterSetBuffer(device, this.clusterSetStorageBuffer);
        }
    }

    // CHECKITOUT: this is where the light movement compute shader is dispatched from the host
    onFrame(time: number) {
        this.updateMaxLightsPerClusterUniform();
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

async function readClusterSetBuffer(device, clusterSetBuffer) {
    // Create a staging buffer
    const stagingBuffer = device.createBuffer({
      size: clusterSetBuffer.size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });
  
    // Create a command encoder
    const commandEncoder = device.createCommandEncoder();
  
    // Copy from the cluster set buffer to the staging buffer
    commandEncoder.copyBufferToBuffer(
      clusterSetBuffer, 0,
      stagingBuffer, 0,
      clusterSetBuffer.size
    );
  
    // Submit the commands
    device.queue.submit([commandEncoder.finish()]);
  
    // Map the staging buffer
    await stagingBuffer.mapAsync(GPUMapMode.READ);
  
    // Get the mapped range
    const arrayBuffer = stagingBuffer.getMappedRange();
  
    // Create a view into the buffer
    const data = new Uint32Array(arrayBuffer);
  
    // Assuming each Cluster has a fixed size of 501 uint32 elements (1 for numLights + 5000 for lightIndices)
    const clusterSize = 5001;
    const numClusters = data.length / clusterSize;
    
    var totalLights = 0;
    // Log the numLights for each cluster
    for (let i = 0; i < numClusters; i++) {
      const clusterStart = i * clusterSize;
      const numLights = data[clusterStart];
    //   console.log(`Cluster ${i}: numLights = ${numLights}`);
      totalLights += numLights;
    }
    console.log(`Total lights: ${totalLights}`);
  
    // Unmap the buffer
    stagingBuffer.unmap();
  }
