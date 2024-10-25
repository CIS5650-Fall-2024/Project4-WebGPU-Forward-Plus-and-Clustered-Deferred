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
    
    // declare a new variable for the width of the cluster grid
    static readonly cluster_grid_width = 10;
    
    // declare a new variable for the height of the cluster grid
    static readonly cluster_grid_height = 20;
    
    // declare a new variable for the depth of the cluster grid
    static readonly cluster_grid_depth = 30;
    
    // declare a new variable for the maximum number of lights per cluster
    static readonly light_per_cluster_count = 512;
    
    // declare a new uniform buffer for the cluster grid properties
    cluster_grid_buffer: GPUBuffer;
    
    // declare a new uniform buffer for the light indices in the clusters
    cluster_index_buffer: GPUBuffer;
    
    // declare the bind group layout for the clusters
    cluster_bind_group_layout: GPUBindGroupLayout;
    
    // declare the bind group for the clusters
    cluster_bind_group: GPUBindGroup;
    
    // declare the compute pipeline layout
    compute_pipeline_layout: GPUPipelineLayout;
    
    // declare the compute pipeline compute shader module
    compute_pipeline_compute_shader_module: GPUShaderModule;
    
    // declare the compute pipeline
    compute_pipeline: GPURenderPipeline;
    
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
        
        // allocate the cluster grid buffer
        this.cluster_grid_buffer = device.createBuffer({
            label: "cluster_grid_buffer",
            size: 4 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        // allocate the cluster index buffer
        this.cluster_index_buffer = device.createBuffer({
            label: "cluster_index_buffer",
            size: 4 * (
                Lights.cluster_grid_width
                * Lights.cluster_grid_height
                * Lights.cluster_grid_depth
                * Lights.light_per_cluster_count
            ),
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
        
        // create the bind group layout for the clusters
        this.cluster_bind_group_layout = device.createBindGroupLayout({
            label: "cluster_bind_group_layout",
            entries: [
                
                // create a new bind group layout entry for the cluster grid buffer
                {
                    // specify the binding index
                    binding: 0,
                    
                    // specify the shader stage to be fragment and compute shaders
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    
                    // specify the buffer type to be uniform
                    buffer: {
                        type: "uniform",
                    },
                },
                
                // create a new bind group layout entry for the camera's uniform buffer
                {
                    // specify the binding index
                    binding: 1,
                    
                    // specify the shader stage to be fragment and compute shaders
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    
                    // specify the buffer type to be uniform
                    buffer: {
                        type: "uniform",
                    },
                },
                
                // create a new bind group layout entry for the light buffer
                {
                    // specify the binding index
                    binding: 2,
                    
                    // specify the shader stage to be fragment and compute shaders
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    
                    // specify the buffer type to be read-only storage
                    buffer: {
                        type: "read-only-storage",
                    },
                },
                
                // create a new bind group layout entry for the cluster index buffer
                {
                    // specify the binding index
                    binding: 3,
                    
                    // specify the shader stage to be fragment and compute shaders
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
                    
                    // specify the buffer type to be storage
                    buffer: {
                        type: "storage",
                    },
                },
            ],
        });
        
        // create the bind group for the clusters
        this.cluster_bind_group = device.createBindGroup({
            label: "cluster_bind_group",
            layout: this.cluster_bind_group_layout,
            entries: [
                
                // create a new bind group entry for the cluster grid buffer
                {
                    // specify the binding index
                    binding: 0,
                    
                    // specify the resource to be the camera's uniform buffer
                    resource: {
                        buffer: this.cluster_grid_buffer,
                    },
                },
                
                // create a new bind group entry for the camera's uniform buffer
                {
                    // specify the binding index
                    binding: 1,
                    
                    // specify the resource to be the camera's uniform buffer
                    resource: {
                        buffer: camera.uniformsBuffer,
                    },
                },
                
                // create a new bind group entry for the light buffer
                {
                    // specify the binding index
                    binding: 2,
                    
                    // specify the resource to be the light buffer
                    resource: {
                        buffer: this.lightSetStorageBuffer,
                    },
                },
                
                // create a new bind group entry for the cluster index buffer
                {
                    // specify the binding index
                    binding: 3,
                    
                    // specify the resource to be the cluster index buffer
                    resource: {
                        buffer: this.cluster_index_buffer,
                    },
                },
            ],
        });
        
        // create the compute pipeline layout
        this.compute_pipeline_layout = device.createPipelineLayout({
            label: "compute_pipeline_layout",
            bindGroupLayouts: [
                this.cluster_bind_group_layout,
            ],
        });
        
        // create the compute pipeline compute shader module
        this.compute_pipeline_compute_shader_module = device.createShaderModule({
            label: "compute_pipeline_compute_shader_module",
            code: shaders.clusteringComputeSrc,
        });
        
        // declare the compute pipeline
        this.compute_pipeline = device.createComputePipeline({
            label: "compute_pipeline",
            layout: this.compute_pipeline_layout,
            compute: {
                module: this.compute_pipeline_compute_shader_module,
                entryPoint: "main",
            },
        });
        
        // write the cluster grid width, height, and depth to the cluster grid buffer
        device.queue.writeBuffer(
            this.cluster_grid_buffer, 0,
            new Uint32Array([
                Lights.cluster_grid_width,
                Lights.cluster_grid_height,
                Lights.cluster_grid_depth,
                Lights.light_per_cluster_count,
            ])
        );
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

    // define the function for executing the compute shader
    compute(encoder: GPUCommandEncoder) {
        
        // create a new compute pass
        const compute_pass = encoder.beginComputePass();
        
        // bind the compute pipeline
        compute_pass.setPipeline(this.compute_pipeline);
        
        // bind the scene's bind group
        compute_pass.setBindGroup(
            0, this.cluster_bind_group
        );
        
        // compute the workload
        const workload = Math.ceil(
            Lights.cluster_grid_width
            * Lights.cluster_grid_height
            * Lights.cluster_grid_depth
            / shaders.constants.moveLightsWorkgroupSize
        );
        
        // dispatch the compute shader
        compute_pass.dispatchWorkgroups(workload);
        
        // end the compute pass
        compute_pass.end();
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
