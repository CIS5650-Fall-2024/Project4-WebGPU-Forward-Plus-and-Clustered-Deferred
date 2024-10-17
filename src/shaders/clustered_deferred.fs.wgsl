// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) fragPosition: vec3<f32>,
    @location(1) fragNormal: vec3<f32>,
    @location(2) fragUV: vec2<f32>,
};

struct FragmentOutput {
    @location(0) diffuseColor: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) depth: f32,
};

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;
@fragment
fn main(input: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;
    let diffColor = textureSample(diffuseTex, diffuseTexSampler, input.fragUV);
    if (diffColor.a < 0.5f) {
        discard;
    }
    output.diffuseColor = diffColor;
    output.normal = vec4<f32>(normalize(input.fragNormal), 1.0);
    output.depth = input.position.z;
    return output;
}
