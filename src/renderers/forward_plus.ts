import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ForwardPlusRenderer extends renderer.Renderer {
    // TODO-2: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    pipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);
        // TODO-2: initialize layouts, pipelines, textures, etc. needed for Forward+ here

        //scene Uniform Bind Group Layout
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                { // camera uniform buffer accessible to vertex shader
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
                },
                { // lightSet buffer accessible to frag shader
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" }
                }
            ]
        });

        // instance of a sceneUniformsBindGroupLayout
        // I might be able to have multipe if I wanted to
        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
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

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
        this.depthTextureView = this.depthTexture.createView();


        //Render pipeline!
        this.pipeline = renderer.device.createRenderPipeline(
        {
            layout: renderer.device.createPipelineLayout(
                {
                    label: "forward+ pipeline layout",
                    bindGroupLayouts: [
                        this.sceneUniformsBindGroupLayout,
                        renderer.modelBindGroupLayout,
                        renderer.materialBindGroupLayout
                    ]
                }
            ),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus"
            },
            vertex: {
                module: renderer.device.createShaderModule(
                    {
                        label: "naive vert shader",
                        code: shaders.naiveVertSrc
                    }
                ),
                buffers: [ renderer.vertexBufferLayout ]
            },
            fragment: {
                module: renderer.device.createShaderModule(
                    {
                        label: "forward+ frag shader",
                        code: shaders.forwardPlusFragSrc,
                    }
                ),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    }
                ]
            }
        });
    }

    override draw() {
        // TODO-2: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the main rendering pass, using the computed clusters for efficient lighting

        const encoder = renderer.device.createCommandEncoder();

        // 1. Clustering compute shader!
        this.lights.doLightClustering(encoder);

        // 2. Main rendering pass!

        const canvasTextureView = renderer.context.getCurrentTexture().createView();

        const renderPass = encoder.beginRenderPass({
            label: "forward+ render pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
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


        renderPass.setPipeline(this.pipeline);

        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        // Traverse through .glTF extract scene file!
        this.scene.iterate(node => {
            renderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            renderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            renderPass.setVertexBuffer(0, primitive.vertexBuffer);
            renderPass.setIndexBuffer(primitive.indexBuffer, 'uint32');
            renderPass.drawIndexed(primitive.numIndices);
        });
        
        renderPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
