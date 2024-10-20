// TODO-2: implement the light clustering compute shader
// Referenced an OpenGL blog recommended by Michael Mason on Ed 
// (https://edstem.org/us/courses/60839/discussion/5490135) (https://www.aortiz.me/2018/12/21/CG.html#part-2)

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: array<ClusterSet>;

fn screenToView(screenIdx: vec2f) -> vec2f {

    // normalize the screen coordinates (NDC)
    let screenNorm = screenIdx / ${clusterSize};

    // convert to clip space
    let clipSpace = vec2(screenNorm.x, screenNorm.y) * 2.0 - 1.0;
    
    // use the inverse projection matrix to convert clip space to view space
    let viewSpace = vec2f(cameraUniforms.invProj[0][0], cameraUniforms.invProj[1][1]) * clipSpace;
    return viewSpace;
}

fn checkLightIntersect(lightPos: vec3f, lightRadius: f32, minBounds: vec3f, maxBounds: vec3f) -> bool {
    var distSqed = 0.0;
    
    for (var i: u32 = 0u; i < 3u; i++) {
        let lightCoord = lightPos[i];
        if (lightCoord < minBounds[i]) {
            distSqed += (minBounds[i] - lightCoord) * (minBounds[i] - lightCoord);
        } else if (lightCoord > maxBounds[i]) {
            distSqed += (lightCoord - maxBounds[i]) * (lightCoord - maxBounds[i]);
        }
    }

    // return if the light is within its radius from the cluster
    return distSqed <= lightRadius * lightRadius;
}

@compute
@workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) global_id: vec3u) {

    if (global_id.x >= ${clusterSize} || 
        global_id.y >= ${clusterSize} || 
        global_id.z > ${clusterSize}) 
    {
        return;
    }

    // ------------------------------------
    // Calculating cluster bounds:
    // ------------------------------------

    // For each cluster (X, Y, Z):
    let clusterIdx = global_id.x + global_id.y * ${clusterSize} + global_id.z * ${clusterSize} * ${clusterSize};

    // Calculate the screen-space bounds for this cluster in 2D (XY).
    // Calculate the depth bounds for this cluster in Z (near and far planes).
    let minDepth = -cameraUniforms.near * pow(cameraUniforms.far / cameraUniforms.near, f32(global_id.z) / ${clusterSize});
    let maxDepth = -cameraUniforms.near * pow(cameraUniforms.far / cameraUniforms.near, f32(global_id.z + 1) / ${clusterSize});

    // Convert these screen and depth bounds into view-space coordinates.
    let minBoundsXY = screenToView(vec2f(global_id.xy));
    let maxBoundsXY = screenToView(vec2f(global_id.xy + 1));

    // Store the computed bounding box (AABB) for the cluster.
    let minNear = minBoundsXY * -minDepth;
    let minFar = minBoundsXY * -maxDepth;
    let maxNear = maxBoundsXY * -minDepth;
    let maxFar = minBoundsXY * -maxDepth;

    let minAABB = vec3f(min(min(minNear, minFar), min(maxNear, maxFar)), maxDepth);
    let maxAABB = vec3f(max(max(minNear, minFar), max(maxNear, maxFar)), minDepth);
    
    // ------------------------------------
    // Assigning lights to clusters:
    // ------------------------------------

    var l = 0u; // number of lights in current cluster

    // For each light:
    for (var i: u32 = 0u; i < lightSet.numLights; i++) {

        let lightPosInView = (cameraUniforms.view * vec4f(lightSet.lights[i].pos, 1)).xyz;

        //Check if the light intersects with the cluster’s bounding box (AABB).
        if (checkLightIntersect(lightPosInView, ${lightRadius}, minAABB, maxAABB)) {

            // If it does, add the light to the cluster's light list.
            clusterSet[clusterIdx].lights[l] = i;
            l += 1;
        
            // Stop adding lights if the maximum number of lights is reached.
            if (l == ${maxLights}) {
                break;
            }
        }
    }

    // Store the number of lights assigned to this cluster.
    clusterSet[clusterIdx].numLights = l;
}