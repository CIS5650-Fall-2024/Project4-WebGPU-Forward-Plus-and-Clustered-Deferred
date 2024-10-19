import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ForwardPlusRenderer extends renderer.Renderer {
    // Bind group layout and related resources
    sceneUniformsBindGroupLayout!: GPUBindGroupLayout;
    sceneUniformsBindGroup!: GPUBindGroup;

    // Depth texture and its view
    depthTexture!: GPUTexture;
    depthTextureView!: GPUTextureView;

    // Render pipeline
    pipeline!: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // Initialize bind group layouts, pipelines, and textures for Forward+ rendering

        this.initBindGroupLayout();
        this.initBindGroup();
        this.initDepthTexture();
        this.initPipeline();
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

    // Initialize the render pipeline for Forward+ rendering
    private initPipeline() {
        this.pipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "Forward Plus Pipeline Layout",
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
                buffers: [renderer.vertexBufferLayout]
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "Forward Plus Fragment Shader",
                    code: shaders.forwardPlusFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });
    }

    // Perform the drawing operations using Forward+ rendering
    override draw() {
        // Create a command encoder for the rendering process
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        // Execute the light clustering step
        this.lights.doLightClustering(encoder);

        // Set up the render pass for drawing
        const renderPass = encoder.beginRenderPass({
            label: "Forward Plus Render Pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0], // Clear color
                    loadOp: "clear",
                    storeOp: "store"
                }
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0, // Clear depth
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });

        // Configure the pipeline and bind groups
        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        // Iterate over scene objects and configure their respective bindings
        this.scene.iterate(
            node => renderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup),
            material => renderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup),
            primitive => {
                renderPass.setVertexBuffer(0, primitive.vertexBuffer);
                renderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
                renderPass.drawIndexed(primitive.numIndices);
            }
        );

        // Complete the render pass and submit the commands to the GPU
        renderPass.end();
        renderer.device.queue.submit([encoder.finish()]);
    }
}