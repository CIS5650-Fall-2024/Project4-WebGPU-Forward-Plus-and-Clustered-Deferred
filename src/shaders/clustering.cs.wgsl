// TODO-2: implement the light clustering compute shader
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusters: array<ClusterSet>;

@compute @workgroup_size(16, 12, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let clusterIndex = global_id.x + global_id.y * ${clusteringCountX} + global_id.z * ${clusteringCountX} * ${clusteringCountY};
    if (clusterIndex >= ${clusteringCountTotal}) {
        return;
    }

    // ------------------------------------
    // Calculating cluster bounds:
    // ------------------------------------
    // For each cluster (X, Y, Z):
    // Calculate the screen-space bounds for this cluster in 2D (XY).
    var minX_ndc = 2.0 * f32(global_id.x) / f32(${clusteringCountX}) - 1.0;
    var maxX_ndc = 2.0 * f32(global_id.x + 1) / f32(${clusteringCountX}) - 1.0;
    var minY_ndc = 2.0 * f32(global_id.y) / f32(${clusteringCountY}) - 1.0;
    var maxY_ndc = 2.0 * f32(global_id.y + 1) / f32(${clusteringCountY}) - 1.0;

    // Calculate the depth bounds for this cluster in Z (near and far planes).
    var minZ_view = -${nearClip} * pow(f32(${farClip}) / f32(${nearClip}), f32(global_id.z) / f32(${clusteringCountZ}));
    var maxZ_view = -${nearClip} * pow(f32(${farClip}) / f32(${nearClip}), f32(global_id.z + 1) / f32(${clusteringCountZ}));

    var minZ_ndc_vec = camera.projMat * vec4<f32>(0.0,0.0,minZ_view,1.0);
    var minZ_ndc = minZ_ndc_vec.z/minZ_ndc_vec.w;
    var maxZ_ndc_vec = camera.projMat * vec4<f32>(0.0,0.0,maxZ_view,1.0);
    var maxZ_ndc = maxZ_ndc_vec.z/maxZ_ndc_vec.w;

    // Convert these screen and depth bounds into view-space coordinates.
    var ndcMinBounds_vec = camera.invProjMat * vec4<f32>(minX_ndc, minY_ndc, minZ_ndc, 1.0);
    var ndcMaxBounds_vec = camera.invProjMat * vec4<f32>(maxX_ndc, maxY_ndc, maxZ_ndc, 1.0);
    var ndcMinBounds = ndcMinBounds_vec.xyz/ndcMinBounds_vec.w;
    var ndcMaxBounds = ndcMaxBounds_vec.xyz/ndcMaxBounds_vec.w;

    // Store the computed bounding box (AABB) for the cluster.
    clusters[clusterIndex].minAABB = ndcMinBounds;
    clusters[clusterIndex].maxAABB = ndcMaxBounds;

    // ------------------------------------
    // Assigning lights to clusters:
    // ------------------------------------
    // For each cluster:
    // Initialize a counter for the number of lights in this cluster.
    var lightCount: u32 = 0u;

    // For each light:
    // Store the number of lights assigned to this cluster.
    for (var i: u32 = 0u; i < lightSet.numLights; i++) {
        let light_view = camera.viewMat * vec4<f32>(lightSet.lights[i].pos,1.0);
        // Check if the light intersects with the cluster’s bounding box (AABB).
        if (lightIntersectsCluster(light_view.xyz, ndcMinBounds, ndcMaxBounds)) {
            // If it does, add the light to the cluster's light list.
            if (lightCount < ${maxNumLightsPerCluster}) {
                clusters[clusterIndex].lightIndices[lightCount] = i;
                lightCount++;
            }
            else{ break; } // Stop adding lights if the maximum number of lights is reached.
        }
    }
    clusters[clusterIndex].lightCount = lightCount;
}

// Helper function: Check if a light intersects with the cluster's bounding box (AABB)
fn lightIntersectsCluster(lightPos: vec3f, clusterMin: vec3f, clusterMax: vec3f) -> bool {
    let closestPoint = clamp(lightPos, clusterMin, clusterMax);
    let distanceToCluster = distance(lightPos, closestPoint);
    return distanceToCluster <= ${lightRadius};
}
