@group(${bindGroup_scene}) @binding(0) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(3) var<uniform> clusterUniforms: ClusterUniforms;

fn doesLightIntersectCluster(lightPos: vec3f, clusterMinBounds: vec3f, clusterMaxbounds: vec3f) -> bool {
    let closestPoint = max(clusterMinBounds, min(lightPos, clusterMaxbounds));
    let distance = closestPoint - lightPos;
    let distanceSquared = dot(distance, distance);

    return distanceSquared < (${lightRadius} * ${lightRadius});
}

fn zFromZIndex(zIndex: f32) -> f32 {
    // Slice up Z exponential in **view space**
    // Equation derived from eq. 3 in http://www.aortiz.me/2018/12/21/CG.html#forward-shading, solving for Z (with a lot of algebraic manipulation).
    // Negative sign accounts for the fact that the camera looks down the negative Z axis.
    return -camera.near * pow((camera.far / camera.near), zIndex / clusterUniforms.clusterDims.z);
}

// Returns the XY **view space** bounds of a cluster, given its XY indices
fn xyFromIndex(xyIndex: vec2f) -> vec2f {
    // This simultaneously transforms the XY index from screen space to NDC space, then inverse projects to view space.
    // Only two components of the inverse projection matrix affect the XY components.
    return (2.0 * (xyIndex / clusterUniforms.clusterDims.xy) - 1.0) * vec2f(camera.invProjMat[0][0], camera.invProjMat[1][1]);
}

@compute
@workgroup_size(${computeClustersWorkgroupSize})
fn main(@builtin(global_invocation_id) global_idx: vec3u) {
    if (f32(global_idx.x) >= clusterUniforms.clusterDims.x ||
        f32(global_idx.y) >= clusterUniforms.clusterDims.y ||
        f32(global_idx.z) >= clusterUniforms.clusterDims.z) {
            return;
    }

    let clusterIndex = global_idx.x
                     + (global_idx.y * u32(clusterUniforms.clusterDims.x))
                     + (global_idx.z * u32(clusterUniforms.clusterDims.x) * u32(clusterUniforms.clusterDims.y));

    // All in view space
    var minBoundsXY = xyFromIndex(vec2f(f32(global_idx.x), f32(global_idx.y)));
    var maxBoundsXY = xyFromIndex(vec2f(f32(global_idx.x + 1u), f32(global_idx.y + 1u)));
    let minBoundsZ = zFromZIndex(f32(global_idx.z));
    let maxBoundsZ = zFromZIndex(f32(global_idx.z + 1u));

    // Now, these XY bounds *were* the max and min bounds of the cluster in NDC space. After transformation, we need to scale them,
    // essentially undoing the perspective division, to get the bounds at the near and far planes of the view frustum.
    minBoundsXY = min(minBoundsXY * -minBoundsZ, minBoundsXY * -maxBoundsZ);
    maxBoundsXY = max(maxBoundsXY * -minBoundsZ, maxBoundsXY * -maxBoundsZ);

    // Note: since Z bounds are negative, maxBoundsZ is actually the "min" bound here, and vice versa for minBoundsZ.
    let minViewBounds = vec3f(minBoundsXY, maxBoundsZ);
    let maxViewBounds = vec3f(maxBoundsXY, minBoundsZ);

    /* Assigning lights to clusters */
    var lightCount = 0u ;
    for (var i = 0u; i < lightSet.numLights; i++) {
        if (lightCount >= ${maxLightsPerCluster}) {
            break;
        }

        let viewSpaceLightPos = camera.viewMat * vec4f(lightSet.lights[i].pos, 1.0);
        if (!doesLightIntersectCluster(viewSpaceLightPos.xyz, minViewBounds, maxViewBounds)) {
            continue;
        }

        clusterSet.clusters[clusterIndex].lightIndices[lightCount] = i;
        lightCount++;
    }

    clusterSet.clusters[clusterIndex].lightCount = lightCount;
}