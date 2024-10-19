import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {

    gBufferTextures: GPUTexture[] = [];
    gBufferViews: GPUTextureView[] = [];

    sceneUniformsBindGroupLayout!: GPUBindGroupLayout;
    sceneUniformsBindGroup!: GPUBindGroup;

    gBufferBindGroupLayout!: GPUBindGroupLayout;
    gBufferBindGroup!: GPUBindGroup;

    depthTexture!: GPUTexture;
    depthTextureView!: GPUTextureView;

    pipeline!: GPURenderPipeline;

    gBufferPipeline!: GPURenderPipeline;
    fullscreenPipeline!: GPURenderPipeline;

    normalSampler!: GPUSampler;

    constructor(stage: Stage) {
        super(stage);

        // Initialize bind group layouts, pipelines, and textures for G-buffer and fullscreen passes
        this.initGBufferTextures();
        this.initBindGroupLayout();
        this.initBindGroup();
        this.initDepthTexture();
        this.initGBufferPipeline();
        this.initFullscreenPipeline();
        this.initSamplers();
        this.initGBufferBindGroup();
    }

    // Create the sampler for the G-buffer textures
    private initSamplers() {
        this.normalSampler = renderer.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear'
        });
    }

    // Initialize the bind group for G-buffer textures
    private initGBufferBindGroup() {
        this.gBufferBindGroup = renderer.device.createBindGroup({
            layout: this.gBufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.gBufferViews[0] // Position G-buffer texture view
                },
                {
                    binding: 1,
                    resource: this.gBufferViews[1] // Normal G-buffer texture view
                },
                {
                    binding: 2,
                    resource: this.gBufferViews[2] // Albedo G-buffer texture view
                },
                {
                    binding: 3,
                    resource: this.normalSampler
                }
            ]
        });
    }

    // Initialize the pipeline for the fullscreen lighting pass
    private initFullscreenPipeline() {
        // Create the G-buffer bind group layout
        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "G-Buffer Texture Bind Group Layout",
            entries: [
                {
                    binding: 0, // Position texture
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" }
                },
                {
                    binding: 1, // Normal texture
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" }
                },
                {
                    binding: 2, // Albedo texture
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" }
                },
                {
                    binding: 3, // Sampler
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                }
            ]
        });

        // Create the fullscreen pipeline
        this.fullscreenPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "Fullscreen Pipeline Layout",
                bindGroupLayouts: [
                    this.gBufferBindGroupLayout,        // Bind group 0: G-buffer textures
                    this.sceneUniformsBindGroupLayout   // Bind group 1: Scene uniforms
                ]
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "Fullscreen Vertex Shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                }),
                entryPoint: 'main',
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "Fullscreen Fragment Shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                entryPoint: 'main',
                targets: [
                    { format: renderer.canvasFormat } // Output format
                ]
            },
            primitive: {
                topology: "triangle-list",
                stripIndexFormat: undefined
            }
        });
    }

    // Initialize G-buffer textures
    private initGBufferTextures() {
        const textureFormats: GPUTextureFormat[] = ["rgba16float", "rgba16float", "rgba8unorm"]; // Position, Normal, Albedo
        const size = [renderer.canvas.width, renderer.canvas.height];
    
        this.gBufferTextures = textureFormats.map(format => 
            renderer.device.createTexture({
                size,
                format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            })
        );
    
        this.gBufferViews = this.gBufferTextures.map(texture => texture.createView());
    }

    // Initialize the bind group layout for scene uniforms
    private initBindGroupLayout() {
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "Scene Uniforms Bind Group Layout",
            entries: [
                {
                    binding: 0, // Camera
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                {
                    binding: 1, // Lights
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 2, // Light Clusters
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });
    }

    // Initialize the actual bind group for scene uniforms
    private initBindGroup() {
        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "Scene Uniforms Bind Group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer }
                },
                {
                    binding: 2,
                    resource: { buffer: this.lights.clusterSetStorageBuffer }
                }
            ]
        });
    }

    // Initialize the depth texture for rendering
    private initDepthTexture() {
        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height], // Use canvas size
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();
    }

    // Initialize the G-buffer pass pipeline
    private initGBufferPipeline() {
        this.gBufferPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "G-buffer Pipeline Layout",
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
                    label: "Vertex Shader",
                    code: shaders.naiveVertSrc
                }),
                entryPoint: 'main',
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "G-buffer Fragment Shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                entryPoint: 'main',
                targets: [
                    { format: "rgba16float" }, // Position
                    { format: "rgba16float" }, // Normal
                    { format: "rgba8unorm" }   // Albedo
                ]
            },
            primitive: {
                topology: "triangle-list",
                cullMode: 'back',
            }
        });
    }

    override draw() {
        const encoder = renderer.device.createCommandEncoder();
    
        // Step 1: Run the clustering compute shader to determine which lights affect which clusters
        this.lights.doLightClustering(encoder);
    
        // Step 2: Run the G-buffer pass
        const gBufferPass = encoder.beginRenderPass({
            label: "G-buffer Pass",
            colorAttachments: [
                {
                    view: this.gBufferViews[0],
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.gBufferViews[1],
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                },
                {
                    view: this.gBufferViews[2],
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });
    
        // Bind G-buffer pipeline and required resources
        gBufferPass.setPipeline(this.gBufferPipeline);
        gBufferPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
    
        // Render each primitive to G-buffer
        this.scene.iterate(
            node => gBufferPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup),
            material => gBufferPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup),
            primitive => {
                gBufferPass.setVertexBuffer(0, primitive.vertexBuffer);
                gBufferPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
                gBufferPass.drawIndexed(primitive.numIndices);
            }
        );
    
        gBufferPass.end();
    
        // Step 3: Fullscreen pass to perform lighting using G-buffer and clustered lights
        const renderPass = encoder.beginRenderPass({
            label: "Fullscreen Lighting Pass",
            colorAttachments: [
                {
                    view: renderer.context.getCurrentTexture().createView(),
                    clearValue: [0, 0, 0, 1],
                    loadOp: "clear",
                    storeOp: "store"
                }
            ]
        });
    
        // Bind the fullscreen pipeline and bind groups
        renderPass.setPipeline(this.fullscreenPipeline);
        renderPass.setBindGroup(0, this.gBufferBindGroup);
        renderPass.setBindGroup(1, this.sceneUniformsBindGroup);
        renderPass.draw(6, 1, 0, 0); // Draw the fullscreen quad
    
        renderPass.end();
    
        // Submit the command encoder to the GPU
        renderer.device.queue.submit([encoder.finish()]);
    }
}