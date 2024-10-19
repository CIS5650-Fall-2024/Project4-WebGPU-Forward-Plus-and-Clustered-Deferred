// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct VertexInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct GBufferOutput
{
    @location(0) albedo: vec4f,
    @location(1) normal: vec4f,
    @location(2) depth: f32
}

@fragment
fn main(in: VertexInput) -> GBufferOutput {
    var out: GBufferOutput;

    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f){
        discard;
    }

    out.albedo = diffuseColor;
    out.normal = vec4f(normalize(in.nor), 1.0);
    out.depth = in.pos.z;
    return out;
}

