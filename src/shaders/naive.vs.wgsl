// CHECKITOUT: you can use this vertex shader for all of the renderers

// TODO-1.3: add a uniform variable here for camera uniforms (of type CameraUniforms)
// make sure to use ${bindGroup_scene} for the group
// camera uniforms are bind to slot 0 in the bind group
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_model}) @binding(0) var<uniform> modelMat: mat4x4f;

struct VertexInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct VertexOutput
{
    @builtin(position) fragPos: vec4f, // Will automatically do persepective divide, flip y, and convert to screen space (i.e. to your canvas's dimensions)
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f,
    @location(3) pos_view: vec3f
}

@vertex
fn main(in: VertexInput) -> VertexOutput
{
    let modelPos = modelMat * vec4(in.pos, 1); // World space position

    var out: VertexOutput;
    out.fragPos = cameraUniforms.viewProj * modelPos; // Clip space pos
    out.pos = modelPos.xyz / modelPos.w; 
    out.nor = in.nor; 
    out.uv = in.uv;   
    out.pos_view = (cameraUniforms.view * modelPos).xyz; // View space position

    return out;
}
