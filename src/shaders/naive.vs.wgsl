// CHECKITOUT: you can use this vertex shader for all of the renderers

// declare the camera's uniform variable
@group(${bindGroup_scene}) @binding(0)
var<uniform> camera: CameraUniforms;

@group(${bindGroup_model}) @binding(0) var<uniform> modelMat: mat4x4f;

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
    
    // compute the output position for the fragment shader
    out.fragPos = camera.matrix * modelPos;
    
    out.pos = modelPos.xyz / modelPos.w;
    out.nor = in.nor;
    out.uv = in.uv;
    return out;
}
