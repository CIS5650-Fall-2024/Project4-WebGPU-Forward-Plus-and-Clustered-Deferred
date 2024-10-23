// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.

struct GBufferOutput {
    @location(0) albedo: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) position: vec4<f32>,
};

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraData: CameraUniforms;
@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @location(0) pos: vec3<f32>,
    @location(1) nor: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @builtin(position) fragCoord: vec4<f32>
};

@fragment
fn main(in: FragmentInput) -> GBufferOutput {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);

    let normal = vec4<f32>(normalize(in.nor), 0.0);

    let position = vec4<f32>(in.pos, 1.0);

    return GBufferOutput(diffuseColor, normal, position);
}
