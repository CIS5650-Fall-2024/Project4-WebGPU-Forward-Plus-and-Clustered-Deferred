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
};

@fragment
fn main(input: VertexOutput) -> FragmentOutput {
    var output: FragmentOutput;
    
    // Store the diffuse color (assuming we have a texture sampler for diffuse color)
    // If you don't have a texture, you can use a constant color or the vertex color
    output.diffuseColor = vec4<f32>(input.fragPosition, 1.0); // Placeholder, replace with actual diffuse color
    
    // Store the normal, converting it to a suitable format
    output.normal = vec4<f32>(normalize(input.fragNormal), 1.0);
    
    return output;
}