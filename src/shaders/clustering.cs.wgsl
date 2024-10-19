// TODO-2: implement the light clustering compute shader
// bind uniforms for camera, light, and cluster data
@group(${bindGroup_scene}) @binding(0) var<storage, read_write> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(1) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

fn screenToView(screenCoord: vec2f) -> vec3f {
    var ndc: vec4f = vec4f(screenCoord / vec2f(cameraUniforms.canvasSizeX, cameraUniforms.canvasSizeY) * 2.0 - 1.0, -1.0, 1.0);
    var viewCoord: vec4f = cameraUniforms.inverseProjMat * ndc;
    viewCoord /= viewCoord.w;

    return viewCoord.xyz;
}

fn lineIntersectionWithZPlane(startPoint: vec3f, endPoint: vec3f, zDistance: f32) -> vec3f {
    var direction: vec3f = endPoint - startPoint;
    var normal: vec3f = vec3f(0.0, 0.0, -1.0);

    var t: f32 = (zDistance - dot(normal, startPoint)) / dot(normal, direction);
    return startPoint + t * direction;
}

fn clusterBound(clusterIdx: u32, tileSize: u32) {
    var tileIdx: vec3u = vec3u(clusterIdx % u32(cameraUniforms.tileCountX), (clusterIdx / u32(cameraUniforms.tileCountX)) % u32(cameraUniforms.tileCountY), clusterIdx / u32(cameraUniforms.tileCountX * cameraUniforms.tileCountY));
    var tilePixelSize_X: u32 = u32(cameraUniforms.canvasSizeX) / u32(cameraUniforms.tileCountX);
    var tilePixelSize_Y: u32 = u32(cameraUniforms.canvasSizeY) / u32(cameraUniforms.tileCountY);
    var minTile_screenspace: vec2u = tileIdx.xy * vec2u(tilePixelSize_X, tilePixelSize_Y);
    var maxTile_screenspace: vec2u = (tileIdx.xy + vec2u(1, 1)) * vec2u(tilePixelSize_X, tilePixelSize_Y);

    // convert to view space
    var minTile_view: vec3f = screenToView(vec2f(minTile_screenspace));
    var maxTile_view: vec3f = screenToView(vec2f(maxTile_screenspace));

    var minZ: f32 = cameraUniforms.zNear * pow(cameraUniforms.zFar / cameraUniforms.zNear, f32(tileIdx.z / u32(cameraUniforms.tileCountZ)));
    var maxZ: f32 = cameraUniforms.zNear * pow(cameraUniforms.zFar / cameraUniforms.zNear, f32((tileIdx.z + 1) / u32(cameraUniforms.tileCountZ)));

    var minPointNear: vec3f = lineIntersectionWithZPlane(vec3f(0.0, 0.0, 0.0), minTile_view, minZ);
    var minPointFar: vec3f = lineIntersectionWithZPlane(vec3f(0.0, 0.0, 0.0), minTile_view, maxZ);
    var maxPointNear: vec3f = lineIntersectionWithZPlane(vec3f(0.0, 0.0, 0.0), maxTile_view, minZ);
    var maxPointFar: vec3f = lineIntersectionWithZPlane(vec3f(0.0, 0.0, 0.0), maxTile_view, maxZ);

    clusterSet.clusters[clusterIdx].minPoint = vec4f(min(minPointNear, minPointFar), 0.0);
    clusterSet.clusters[clusterIdx].maxPoint = vec4f(max(maxPointNear, maxPointFar), 0.0);
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

fn sphereAABBIntersection(center: vec3f, radius: f32, aabbMin: vec3f, aabbMax: vec3f) -> bool {
    var closestPoint = clamp(center, aabbMin, aabbMax);
    var distance = dot(closestPoint - center, closestPoint - center);
    return distance <= radius * radius;
}

fn testSphereAABB(cluster: ptr<storage, Cluster, read_write>, lightIdx: u32) -> bool {
    var lightPos: vec3f = lightSet.lights[lightIdx].pos;
    var lightRadius: f32 = 10.0;

    var minPoint: vec3f = (*cluster).minPoint.xyz;
    var maxPoint: vec3f = (*cluster).maxPoint.xyz;

    return sphereAABBIntersection(lightPos, lightRadius, minPoint, maxPoint);
}

@compute
@workgroup_size(${clusterComputeWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    var clusterIdx = globalIdx.x;
    if (clusterIdx >= u32(cameraUniforms.tileSize)) {
        return;
    }

    // get AABB for this cluster
    clusterBound(clusterIdx, u32(cameraUniforms.tileSize));

    //var tileIdx: u32 = clusterIdx.x + clusterIdx.y * cameraUniforms.tileCountX + clusterIdx.z * cameraUniforms.tileCountX * cameraUniforms.tileCountY;
    let clusterPtr = &clusterSet.clusters[clusterIdx];

    clusterSet.clusters[clusterIdx].lightCount = 0;
    var lightIdx: u32 = 0u;
    var numLights: u32 = lightSet.numLights;

    for(lightIdx = 0u; lightIdx < numLights; lightIdx++) {
        if (testSphereAABB(&clusterSet.clusters[clusterIdx], lightIdx)) {
            clusterSet.clusters[clusterIdx].lightIndices[clusterSet.clusters[clusterIdx].lightCount] = lightIdx;
            clusterSet.clusters[clusterIdx].lightCount++;
            if (clusterSet.clusters[clusterIdx].lightCount >= 500) {
                break;
            }
        }
    }

}