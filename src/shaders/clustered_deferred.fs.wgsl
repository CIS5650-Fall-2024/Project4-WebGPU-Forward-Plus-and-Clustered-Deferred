
// declare the variable for the camera
@group(${bindGroup_scene}) @binding(0)
var<uniform> camera: CameraUniforms;

// declare the diffuse texture
@group(${bindGroup_material}) @binding(0)
var diffuse_texture: texture_2d<f32>;

// declare the diffuse texture sampler
@group(${bindGroup_material}) @binding(1)
var diffuse_texture_sampler: sampler;

// declare the intermediate data
struct IntermediateData {
    
    // declare the fragment position
    @location(0) point: vec3f,
    
    // declare the fragment normal
    @location(1) normal: vec3f,
    
    // declare the fragment texture coordinate
    @location(2) coordinate: vec2f
};

// declare the fragment shader
@fragment fn main(data: IntermediateData) -> @location(0) vec4f {
    
    // acquire the diffuse color
    var color = textureSample(
        diffuse_texture,
        diffuse_texture_sampler,
        data.coordinate
    );
    
    // perform alpha cut with a threshold of 0.5
    if (color.a < 0.5f) {
        discard;
    }
    
    // compress the color into a single float
    let r = u32(clamp(color.r * 1000.0f, 0.0f, 1000.0f));
    let g = u32(clamp(color.g * 1000.0f, 0.0f, 1000.0f));
    let b = u32(clamp(color.b * 1000.0f, 0.0f, 1000.0f));
    let a = f32(r + g * 1000 + b * 1000 * 1000);
    
    // compute and return the intermediate texture data
    return vec4(
        data.normal.x,
        data.normal.y,
        data.normal.z,
        a
    );
}
