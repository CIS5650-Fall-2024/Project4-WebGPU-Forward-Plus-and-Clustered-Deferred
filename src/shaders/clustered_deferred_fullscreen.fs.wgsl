
// declare the intermediate data
struct IntermediateData {
    
    // declare the fragment texture coordinate
    @location(0) coordinate: vec2f
};

// declare the variable for the camera
@group(0) @binding(0)
var<uniform> camera: CameraUniforms;

// declare the intermediate texture
@group(0) @binding(1)
var intermediate_texture: texture_2d<f32>;

// declare the intermediate texture sampler
@group(0) @binding(2)
var intermediate_texture_sampler: sampler;

// declare the intermediate texture
@group(0) @binding(3)
var depth_texture: texture_2d<f32>;

// declare the variable for the lights
@group(0) @binding(4)
var<storage, read> lights: LightSet;

// declare the variable for the cluster grid
@group(1) @binding(0)
var<uniform> cluster_grid: vec4<u32>;

// declare the variable for the light indices
@group(1) @binding(3)
var<storage, read_write> indices: cluster_index_data;

// declare the fragment shader
@fragment fn main(data: IntermediateData) -> @location(0) vec4f {
    
    // acquire the intermediate color
    var color = textureSample(
        intermediate_texture,
        intermediate_texture_sampler,
        data.coordinate
    );
    
    // extract the normal
    let normal = vec3f(
        color.r,
        color.g,
        color.b
    );
    
    // extract the color
    let a = color.a;
    let b = floor(a / (1000.0f * 1000.0f));
    let g = floor((a - b * 1000.0f * 1000.0f) / 1000.0f);
    let r = (a - g * 1000.0f - b * 1000.0f * 1000.0f);
    color = vec4f(vec3f(r, g, b) / 1000.0f, 1.0f);
    
    // extract the r component from the depth texture
    var depth_r = textureSample(
        depth_texture,
        intermediate_texture_sampler,
        data.coordinate
    ).r;
    
    // compute the pixel_coordinate
    var pixel_coordinate = vec4f(
        data.coordinate.x * 2.0f - 1.0f,
        (1.0f - data.coordinate.y) * 2.0f - 1.0f,
        depth_r,
        1.0f
    );
    
    // compute the view space position
    var view_space_position = camera.inverse_projection * pixel_coordinate;
    
    // perform perspective divide
    view_space_position /= view_space_position.w;
    
    // compute the world space position
    var world_space_position = camera.inverse_view * vec4f(view_space_position.xyz, 1.0f);
    
    // project the fragment position
    let position = camera.matrix * vec4f(world_space_position.xyz, 1.0f);
    
    // compute the pixel-space coordinate
    let coordinate = position.xy / position.w;
    
    // compute the linear depth
    let depth = log(position.z / camera.camera.x) / log(camera.camera.y / camera.camera.x);
    
    // compute the cluster's x index
    let x = u32(floor((coordinate.x * 0.5f + 0.5f) * f32(cluster_grid.x)));
    
    // compute the cluster's y index
    let y = u32(floor((coordinate.y * 0.5f + 0.5f) * f32(cluster_grid.y)));
    
    // compute the cluster's z index
    let z = u32(floor(depth * f32(cluster_grid.z)));
    
    // compute the cluster index
    let index = x + y * cluster_grid.x + z * cluster_grid.x * cluster_grid.y;
    
    // compute the start index for the lights to iterate
    let start_index = index * cluster_grid.w;
    
    // declare the variable for the total light contribution
    var total_light_contribution = vec3f(0.0f, 0.0f, 0.0f);
    
    // declare the number of lights iterated
    var count = 0u;
    
    // iterate through the lights in this cluster
    while (count < cluster_grid.w) {
        
        // acquire the current index
        let light_index = indices.indices[start_index + count];
        
        // exit when the termination condition is met
        if (light_index == 2 << 30) {
            break;
        }
        
        // acquire the current light
        let light = lights.lights[light_index];
        
        // update the total light contribution
        total_light_contribution += calculateLightContrib(
            light, world_space_position.xyz, normal
        );
        
        // increase the count
        count += 1;
    }
    
    // update the color
    color = vec4f(color.rgb * total_light_contribution, 1.0f);
    
    // return the fragment color
    return vec4f(color.rgb, 1.0f);
}
