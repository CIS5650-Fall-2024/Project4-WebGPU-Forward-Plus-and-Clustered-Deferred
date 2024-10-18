// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct FragmentOutput {
    @location(0) position: vec4<f32>,  // positionBuffer
    @location(1) normal: vec4<f32>,    // normalBuffer
    @location(2) albedo: vec4<f32>,    // albedoBuffer
};

@fragment
fn main(in: FragmentInput) -> @location(0) vec4<u32>
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }
    
    let normalOut = pack2x16unorm(encodeNormal(normalize(in.nor)));
    let albedoOut = pack4x8unorm(vec4<f32>(diffuseColor.rgb, 1.0));
    let depthU32: u32 = bitcast<u32>(in.fragPos.z);

    return vec4<u32>(albedoOut, normalOut, depthU32, 1);
}
