// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct FragmentOutput {
    @location(0) gbufferAlbedo: vec4<f32>,
    @location(1) gbufferNormal: vec4<f32>,
    @location(2) gbufferPosition: vec4<f32>,
    @location(3) finalColor: vec4<f32>
}


@fragment
fn main(in: FragmentInput, @builtin(position) fragCoord: vec4<f32>) -> FragmentOutput
{
    var out: FragmentOutput;

    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // populate G-buffer
    out.gbufferPosition = vec4(in.pos, 1.0);
    out.gbufferNormal = vec4(in.nor, 1.0);
    out.gbufferAlbedo = vec4(diffuseColor.rgb, 1.0);

    return out;
}