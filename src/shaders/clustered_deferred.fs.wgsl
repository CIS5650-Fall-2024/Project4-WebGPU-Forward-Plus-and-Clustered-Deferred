// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @location(0) pos: vec3<f32>,
    @location(1) nor: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

struct FragmentOutput {
    @location(0) pos: vec4<f32>,
    @location(1) nor: vec4<f32>,
    @location(2) albedo: vec4<f32>,
};

@fragment
fn main(in: FragmentInput) -> FragmentOutput {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // Output the world-space position
    let positionOutput = vec4<f32>(in.pos, 1.0);

    // Output the world-space normal
    let normalOutput = vec4<f32>(normalize(in.nor), 0.0);

    // Output the albedo color
    let albedoOutput = vec4<f32>(diffuseColor.rgb, 1.0);

    return FragmentOutput(positionOutput, normalOutput, albedoOutput);
}