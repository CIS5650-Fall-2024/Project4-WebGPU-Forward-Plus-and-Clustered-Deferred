// File: shaders/fullscreen_copy.frag.wgsl

@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;

struct FragmentOutput {
    @location(0) color: vec4<f32>,
};

@fragment
fn main(@location(0) uv: vec2<f32>) -> FragmentOutput {
    var output: FragmentOutput;
    let color = textureSample(inputTex, inputSampler, uv);
    output.color = vec4<f32>(color.b, color.g, color.r, color.a);
    return output;
}
