import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;




    // TODO-2: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    clusterBindGroupLayout: GPUBindGroupLayout;
    clusterBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;
    albetoTexture: GPUTexture;
    albetoTextureView: GPUTextureView;
    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;

    textureBindGroupLayout: GPUBindGroupLayout;
    textureBindGroup: GPUBindGroup;

    pipeline: GPURenderPipeline;
    finalPipeline: GPURenderPipeline;


    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                // TODO-1.2: add an entry for camera uniforms at binding 0, visible to only the vertex shader, and of type "uniform"
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                // TODO-1.2: add an entry for camera uniforms at binding 0
                // you can access the camera using `this.camera`
                // if you run into TypeScript errors, you're probably trying to upload the host buffer instead
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer}
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                }
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();

        this.albetoTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.albetoTextureView = this.albetoTexture.createView();

        this.normalTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.normalTextureView = this.normalTexture.createView();

        this.clusterBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "clusters fp bind group layout",
            entries: [
                { 
                    binding: 0, // clusters
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });
        this.clusterBindGroup = renderer.device.createBindGroup({
            label: "cluster bind group",
            layout: this.clusterBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lights.clusterSetStorageBuffer }
                }
            ]
        });

        this.textureBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "texture bind group layout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: "filtering" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "depth" }
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: "filtering" }
                },
                {
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" }
                },
                {
                    binding: 5,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: "filtering" }
                },
            ]
        });

        this.textureBindGroup = renderer.device.createBindGroup({
        layout: this.textureBindGroupLayout,
        entries: [
            {
                binding: 0, // Albedo texture
                resource: this.albetoTextureView
            },
            {
                binding: 1, // Sampler for the textures
                resource: renderer.device.createSampler({
                    magFilter: "linear",
                    minFilter: "linear",
                    mipmapFilter: "linear"
                })
            },
            {
                binding: 2, // Depth texture
                resource: this.depthTextureView
            },
            {
                binding: 3, // Sampler for the textures
                resource: renderer.device.createSampler({
                    magFilter: "linear",
                    minFilter: "linear",
                    mipmapFilter: "linear"
                })
            },
            {
                binding: 4, // Normal texture
                resource: this.normalTextureView

            },
            {
                binding: 5, // Sampler for the textures
                resource: renderer.device.createSampler({
                    magFilter: "linear",
                    minFilter: "linear",
                    mipmapFilter: "linear"
                })
            }
        ]
        });


        this.pipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "texture layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "naive vert shader",
                    code: shaders.naiveVertSrc
                }),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "texture frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    {
                        format: 'rgba8unorm',
                    },
                    {
                        format: 'rgba16float',
                    }
                ]
            }
        });

        this.finalPipeline = renderer.device.createRenderPipeline({
        layout: renderer.device.createPipelineLayout({
            label: "fullscreen pipeline layout",
            bindGroupLayouts: [
                this.sceneUniformsBindGroupLayout,
                this.clusterBindGroupLayout,  // Bind cluster data for sampling
                this.textureBindGroupLayout  // Bind G-buffer textures for sampling
            ]
        }),
        vertex: {
            module: renderer.device.createShaderModule({
                label: "Fullscreen vertex shader",
                code: shaders.clusteredDeferredFullscreenVertSrc,
            }),
            buffers: []  // Fullscreen pass usually doesn't need vertex attributes
        },
        fragment: {
            module: renderer.device.createShaderModule({
                label: "Fullscreen fragment shader",
                code: shaders.clusteredDeferredFullscreenFragSrc,
            }),
            targets: [
                { format: renderer.canvasFormat }  // Final color target (screen)
            ]
        }
    });
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const encoder = renderer.device.createCommandEncoder();
        this.lights.doLightClustering(encoder);

        const firstPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.albetoTextureView,
                    loadOp: "clear",
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
                    storeOp: "store"
                },
                {
                    view: this.normalTextureView,
                    loadOp: "clear",
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            }
        });
        firstPass.setPipeline(this.pipeline);
        firstPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            firstPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            firstPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            firstPass.setVertexBuffer(0, primitive.vertexBuffer);
            firstPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            firstPass.drawIndexed(primitive.numIndices);
        });
        firstPass.end();

        const finalPass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: renderer.context.getCurrentTexture().createView(),
                    loadOp: "clear",
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
                    storeOp: "store"
                }
            ]
        });
        finalPass.setPipeline(this.finalPipeline);

        finalPass.setBindGroup(0, this.sceneUniformsBindGroup);
        finalPass.setBindGroup(1, this.clusterBindGroup);
        finalPass.setBindGroup(2, this.textureBindGroup);
        finalPass.draw(3);
        finalPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
