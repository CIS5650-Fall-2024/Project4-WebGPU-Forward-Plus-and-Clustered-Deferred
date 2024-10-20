// CHECKITOUT: you can use this vertex shader for all of the renderers

// DONE-1.3: add a uniform variable here for camera uniforms (of type CameraUniforms)
// make sure to use ${bindGroup_scene} for the group
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
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@vertex
fn main(in: VertexInput) -> VertexOutput
{
    // Apply model matrix to vertex position
    let modelPos = modelMat * vec4(in.pos, 1);

    var out: VertexOutput;

    // DONE-1.3: use the view proj mat from your CameraUniforms uniform variable
    // Combine model position with view-proj matrix to calculate the final position in clip space
    out.fragPos = cameraUniforms.viewProjMat * modelPos;

    // Normalized device coordinates (NDC) position
    out.pos = modelPos.xyz / modelPos.w;
    
    // Pass the normals and UVs through to the fragment shader
    out.nor = in.nor;
    out.uv = in.uv;
    return out;
}
