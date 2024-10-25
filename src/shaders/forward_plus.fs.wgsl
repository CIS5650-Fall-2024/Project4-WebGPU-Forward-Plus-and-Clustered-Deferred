
// declare the variable for the camera
@group(${bindGroup_scene}) @binding(0)
var<uniform> camera: CameraUniforms;

// declare the variable for the lights
@group(${bindGroup_scene}) @binding(1)
var<storage, read> lights: LightSet;

// declare the diffuse texture
@group(${bindGroup_material}) @binding(0)
var diffuse_texture: texture_2d<f32>;

// declare the diffuse texture sampler
@group(${bindGroup_material}) @binding(1)
var diffuse_texture_sampler: sampler;

// declare the variable for the cluster grid
@group(${bindGroup_cluster}) @binding(0)
var<uniform> cluster_grid: vec4<u32>;

// declare the variable for the light indices
@group(${bindGroup_cluster}) @binding(3)
var<storage, read_write> indices: cluster_index_data;

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
    
    // project the fragment position
    let position = camera.matrix * vec4(data.point, 1.0f);
    
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
            light, data.point, data.normal
        );
        
        // increase the count
        count += 1;
    }
    
    // compute and return the fragment color
    return vec4(color.rgb * total_light_contribution, 1.0f);
}
