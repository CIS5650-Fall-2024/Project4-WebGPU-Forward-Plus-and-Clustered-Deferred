// forward_plus.vs.wgsl
@group(${bindGroup_model}) @binding(0) var<uniform> modelMat: mat4x4f;
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;

struct VertexInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct VertexOutput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@vertex
fn main(in: VertexInput) -> VertexOutput
{
    let modelPos = modelMat * vec4(in.pos, 1);

    var out: VertexOutput;
    out.fragPos = cameraUniforms.viewProj * modelPos; 
    out.pos = modelPos.xyz / modelPos.w;
    out.nor = in.nor;
    out.uv = in.uv;
    return out;
}
