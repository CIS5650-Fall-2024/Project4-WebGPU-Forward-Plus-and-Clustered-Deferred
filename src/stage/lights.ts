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

    static readonly cluster_grid_dimensions = new Uint32Array([10, 10, 30, 512]);

    cluster_grid_dimensions_buffer: GPUBuffer;
    cluster_indices_buffer: GPUBuffer;

    cluster_lights_bind_group_layout: GPUBindGroupLayout;
    cluster_lights_bind_group: GPUBindGroup;
    cluster_lights_pipeline: GPUComputePipeline;

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

        this.cluster_grid_dimensions_buffer = device.createBuffer({
            label: "cluster grid dimensions",
            size: 4 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(this.cluster_grid_dimensions_buffer, 0, Lights.cluster_grid_dimensions);
        this.cluster_indices_buffer = device.createBuffer({
            label: "cluster indices",
            size: Lights.cluster_grid_dimensions[0] *
                  Lights.cluster_grid_dimensions[1] *
                  Lights.cluster_grid_dimensions[2] *
                  Lights.cluster_grid_dimensions[3] * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
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

        this.cluster_lights_bind_group_layout = device.createBindGroupLayout({
            label: "cluster lights compute bind group layout",
            entries: [
                { // cluster grid dimensions
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // camera uniforms
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // lights
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                { // cluster indices
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
                    buffer: { type: "storage" }
                }
            ]
        });

        this.cluster_lights_bind_group = device.createBindGroup({
            label: "cluster lights compute bind group",
            layout: this.cluster_lights_bind_group_layout,
            entries: [
                { // cluster grid dimensions
                    binding: 0,
                    resource: { buffer: this.cluster_grid_dimensions_buffer }
                },
                { // camera uniforms
                    binding: 1,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                { // lights
                    binding: 2,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                { // cluster indices
                    binding: 3,
                    resource: { buffer: this.cluster_indices_buffer }
                }
            ]
        });

        this.cluster_lights_pipeline = device.createComputePipeline({
            label: "cluster lights compute pipeline",
            layout: device.createPipelineLayout({
                label: "cluster lights compute pipeline layout",
                bindGroupLayouts: [ this.cluster_lights_bind_group_layout ]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "cluster lights compute shader",
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

    doLightClustering(encoder: GPUCommandEncoder) {
        const cluster_lights_compute_pass = encoder.beginComputePass();
        cluster_lights_compute_pass.setPipeline(this.cluster_lights_pipeline);
        cluster_lights_compute_pass.setBindGroup(0, this.cluster_lights_bind_group);

        const workgroup_count = Math.ceil(
            Lights.cluster_grid_dimensions[0] *
            Lights.cluster_grid_dimensions[1] *
            Lights.cluster_grid_dimensions[2] /
            shaders.constants.moveLightsWorkgroupSize
        );

        cluster_lights_compute_pass.dispatchWorkgroups(workgroup_count);
        cluster_lights_compute_pass.end();
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
