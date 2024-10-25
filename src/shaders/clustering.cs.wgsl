
// declare the variable for the cluster grid
@group(0) @binding(0)
var<uniform> cluster_grid: vec4<u32>;

// declare the variable for the camera
@group(0) @binding(1)
var<uniform> camera: CameraUniforms;

// declare the variable for the lights
@group(0) @binding(2)
var<storage, read> lights: LightSet;

// declare the variable for the light indices
@group(0) @binding(3)
var<storage, read_write> indices: cluster_index_data;

// declare a new function for converting a point to its cluster indices
fn convert(point: vec3f) -> vec3i {
    
    // project the given point
    let position = camera.matrix * vec4(point, 1.0f);
    
    // compute the pixel-space coordinate
    var coordinate = position.xy;
    
    // perform perspective divide
    if (position.w > 0.0f) {
        coordinate /= position.w;
    }
    
    // compute the linear depth
    let depth = clamp(log(position.z / camera.camera.x) / log(camera.camera.y / camera.camera.x), 0.0f, 1.0f);
    
    // compute the cluster's x index
    let x = i32(floor((coordinate.x * 0.5f + 0.5f) * f32(cluster_grid.x)));
    
    // compute the cluster's y index
    let y = i32(floor((coordinate.y * 0.5f + 0.5f) * f32(cluster_grid.y)));
    
    // compute the cluster's z index
    let z = i32(floor(depth * f32(cluster_grid.z)));
    
    // return the cluster indices
    return vec3i(x, y, z);
}

// declare the compute shader
@compute @workgroup_size(${workgroup_size}) fn main(@builtin(global_invocation_id) index: vec3u) {
    
    // exit the compute shader if the index is out of bound
    if (index.x >= cluster_grid.x * cluster_grid.y * cluster_grid.z) {
        return;
    }
    
    // acquire the x index of the cluster
    let x = i32(index.x % cluster_grid.x);
    
    // acquire the y index of the cluster
    let y = i32((index.x / cluster_grid.x) % cluster_grid.y);
    
    // acquire the z index of the cluster
    let z = i32(index.x / (cluster_grid.x * cluster_grid.y));
    
    // compute the start index for the lights in this cluster
    let start_index = index.x * cluster_grid.w;
    
    // declare the variable for the number of lights in thie cluster
    var count = 0u;
    
    // iterate through all the lights
    for (var light_index = 0u; light_index < lights.numLights; light_index += 1) {
        
        // acquire the current light
        let light = lights.lights[light_index];
        
        // compute the cluster indices of the eight corners
        let index_1 = convert(light.pos + vec3f(-${lightRadius}, -${lightRadius}, -${lightRadius}));
        let index_2 = convert(light.pos + vec3f(${lightRadius}, -${lightRadius}, -${lightRadius}));
        let index_3 = convert(light.pos + vec3f(-${lightRadius}, ${lightRadius}, -${lightRadius}));
        let index_4 = convert(light.pos + vec3f(${lightRadius}, ${lightRadius}, -${lightRadius}));
        let index_5 = convert(light.pos + vec3f(-${lightRadius}, -${lightRadius}, ${lightRadius}));
        let index_6 = convert(light.pos + vec3f(${lightRadius}, -${lightRadius}, ${lightRadius}));
        let index_7 = convert(light.pos + vec3f(-${lightRadius}, ${lightRadius}, ${lightRadius}));
        let index_8 = convert(light.pos + vec3f(${lightRadius}, ${lightRadius}, ${lightRadius}));
        
        // find the min index
        var min_index = index_1;
        min_index = min(min_index, index_2);
        min_index = min(min_index, index_3);
        min_index = min(min_index, index_4);
        min_index = min(min_index, index_5);
        min_index = min(min_index, index_6);
        min_index = min(min_index, index_7);
        min_index = min(min_index, index_8);
        
        // find the max index
        var max_index = index_1;
        max_index = max(max_index, index_2);
        max_index = max(max_index, index_3);
        max_index = max(max_index, index_4);
        max_index = max(max_index, index_5);
        max_index = max(max_index, index_6);
        max_index = max(max_index, index_7);
        max_index = max(max_index, index_8);
        
        // skip this light if its bounding box is out of range
        if (min_index.x > x || x > max_index.x ||
            min_index.y > y || y > max_index.y ||
            min_index.z > z || z > max_index.z) {
            continue;
        }
        
        // write the light index
        indices.indices[start_index + count] = light_index;
        
        // increase the count
        count += 1;
        
        // exit when the index is out of range
        if (count >= cluster_grid.w) {
            break;
        }
    }
    
    // write the termination condition
    if (count < cluster_grid.w) {
        indices.indices[start_index + count] = 2 << 30;
    }
}
