// File: renderers/post_processing.ts

import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class PostProcessingRenderer extends renderer.Renderer {
    //baseRenderer: Renderer; // The renderer to apply post-processing on

    postProcessingComputePipeline: GPUComputePipeline;
    postProcessingBindGroupLayout: GPUBindGroupLayout;
    postProcessingBindGroup: GPUBindGroup;

    inputTexture: GPUTexture;
    inputTextureView: GPUTextureView;

    outputTexture: GPUTexture;
    outputTextureView: GPUTextureView;

    constructor(stage: Stage) {
        super(stage);

        // Choose the base renderer (e.g., NaiveRenderer)
        //this.baseRenderer = new NaiveRenderer(stage);

        // Create textures
        const canvasWidth = renderer.canvas.width;
        const canvasHeight = renderer.canvas.height;

        this.inputTexture = renderer.device.createTexture({
            size: [canvasWidth, canvasHeight],
            format: renderer.canvasFormat,
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.inputTextureView = this.inputTexture.createView();

        this.outputTexture = renderer.device.createTexture({
            size: [canvasWidth, canvasHeight],
            format: renderer.canvasFormat,
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
        });
        this.outputTextureView = this.outputTexture.createView();

        // Post-processing compute pipeline
        this.postProcessingBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "post-processing bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "float" } }, // Input texture
                { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: "write-only", format: renderer.canvasFormat } }, // Output texture
            ],
        });

        this.postProcessingBindGroup = renderer.device.createBindGroup({
            label: "post-processing bind group",
            layout: this.postProcessingBindGroupLayout,
            entries: [
                { binding: 0, resource: this.inputTextureView },
                { binding: 1, resource: this.outputTextureView },
            ],
        });

        this.postProcessingComputePipeline = renderer.device.createComputePipeline({
            layout: renderer.device.createPipelineLayout({
                label: "post-processing compute pipeline layout",
                bindGroupLayouts: [ this.postProcessingBindGroupLayout ],
            }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "post-processing compute shader",
                    code: shaders.postProcessingComputeSrc,
                }),
                entryPoint: "main",
            },
        });
    }

    override draw() {
        // First, draw the scene into the input texture using the base renderer
        const encoder = renderer.device.createCommandEncoder();

        const renderPass = encoder.beginRenderPass({
            label: "base render pass",
            colorAttachments: [
                {
                    view: this.inputTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });

        //this.baseRenderer.drawToRenderPass(renderPass);
        renderPass.end();

        // Then, run the post-processing compute shader
        const computePass = encoder.beginComputePass({
            label: "post-processing compute pass",
        });
        computePass.setPipeline(this.postProcessingComputePipeline);
        computePass.setBindGroup(0, this.postProcessingBindGroup);

        const workGroupSizeX = 16;
        const workGroupSizeY = 16;
        const dispatchX = Math.ceil(renderer.canvas.width / workGroupSizeX);
        const dispatchY = Math.ceil(renderer.canvas.height / workGroupSizeY);

        computePass.dispatchWorkgroups(dispatchX, dispatchY);
        computePass.end();

        // Copy output texture to the swap chain
        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        const copyEncoder = renderer.device.createCommandEncoder();
        copyEncoder.copyTextureToTexture(
            { texture: this.outputTexture },
            { texture: renderer.context.getCurrentTexture() },
            [renderer.canvas.width, renderer.canvas.height, 1]
        );

        renderer.device.queue.submit([encoder.finish(), copyEncoder.finish()]);
    }

    drawToRenderPass(renderPass: GPURenderPassEncoder) {
        // Not used in this context
    }
}
