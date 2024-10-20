// TODO-2: implement the light clustering compute shader
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage,read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;


// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

const tileCount = vec3<u32>(${tilesize[0]}u, ${tilesize[1]}u, ${tilesize[2]}u);

fn screenToView(screen: vec3<f32>)->vec4<f32>{
    let screen_space = vec4(screen,1.0);
    let view_space = camera.invViewProjMat * screen_space;
    return view_space/view_space.w;
}

fn lineIntersectionWithZPlane(startPoint:vec3<f32>,endPoint:vec3<f32>,zDistance:f32)->vec3<f32>
{
    let direction = endPoint - startPoint;
    let normal = vec3(0.0, 0.0, -1.0);
    let t = (zDistance - dot(normal, startPoint)) / dot(normal, direction);
    return startPoint + t * direction;


}
const canvasWidth = 2.0;
const canvasHeight = 2.0;

// @workgroup_size(${clusterWorkgroupSize}) 
fn CalculateClusterBounds(global_id : vec3<u32>)
{
    let clusterIndex = global_id.x + 
                       global_id.y * tileCount.x + 
                       global_id.z * tileCount.x * tileCount.y;

    let clusterDim = vec2(2.0) / vec2(f32(tileCount.x), f32(tileCount.y));
    var minPoint_screen = vec3(vec2(-1.0) + vec2(f32(global_id.x), f32(global_id.y)) * clusterDim,0.0);
    var maxPoint_screen = vec3(minPoint_screen.xy + clusterDim,0.0);

    let planeNear = 0.1 * pow(1000/ 0.1, f32(global_id.z /(tileCount.z)));
    let planeFar = 0.1 * pow(1000/ 0.1, f32((global_id.z + 1) / (tileCount.z)));

    minPoint_screen.z = planeNear;
    maxPoint_screen.z = planeFar;

    let minPoint_view = screenToView(minPoint_screen).xyz;
    let maxPoint_view = screenToView(maxPoint_screen).xyz;



    //Compute AABB
    let minPoint_view_near = lineIntersectionWithZPlane(minPoint_view,vec3(0.0),planeNear);
    let minPoint_view_far = lineIntersectionWithZPlane(minPoint_view,vec3(0.0),planeFar);
    let maxPoint_view_near = lineIntersectionWithZPlane(maxPoint_view,vec3(0.0),planeNear);
    let maxPoint_view_far = lineIntersectionWithZPlane(maxPoint_view,vec3(0.0),planeFar);
    
    clusterSet.clusters[clusterIndex].minBounds = min(minPoint_view_near,minPoint_view_far);
    clusterSet.clusters[clusterIndex].maxBounds = max(minPoint_view_near,minPoint_view_far);
    
}



// ------------------------------------
// Assigning lights to clusters:
// ------------------------------------
// For each cluster:
//     - Initialize a counter for the number of lights in this cluster.

//     For each light:
//         - Check if the light intersects with the cluster’s bounding box (AABB).
//         - If it does, add the light to the cluster's light list.
//         - Stop adding lights if the maximum number of lights is reached.

//     - Store the number of lights assigned to this cluster.
// @workgroup_size(${clusterWorkgroupSize}) 
fn LightClustering(global_id:vec3<u32>)
{
    let cluster_index = global_id.x +
                    global_id.y * tileCount.x +
                    global_id.z * tileCount.x * tileCount.y;
    clusterSet.clusters[cluster_index].numLights = 0;   

    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        if( clusterSet.clusters[cluster_index].numLights < ${maxLightsInCluster})
        {
            let lightPos = lightSet.lights[lightIdx].pos;
            let closestPoint = clamp(lightPos,clusterSet.clusters[cluster_index].minBounds,clusterSet.clusters[cluster_index].maxBounds);
            let distance = length(closestPoint-lightPos);
            if(distance <= ${lightRadius})
            {
                clusterSet.clusters[cluster_index].numLights++;
                clusterSet.clusters[cluster_index].lightIndices[clusterSet.clusters[cluster_index].numLights] = lightIdx ;
            }
        }
    }
}

@compute @workgroup_size(${clusterWorkgroupSize}) 
fn ComputeShadermain(@builtin(global_invocation_id) global_id: vec3u){
    CalculateClusterBounds(global_id);
    LightClustering(global_id);
}

