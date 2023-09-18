const core = require('@actions/core');

const { request, gql, GraphQLClient } = require('graphql-request')

// Railway Required Inputs
const RAILWAY_API_TOKEN = core.getInput('RAILWAY_API_TOKEN');
const PROJECT_ID = core.getInput('PROJECT_ID');
const DEST_ENV_NAME = core.getInput('DEST_ENV_NAME');
const ENDPOINT = 'https://backboard.railway.app/graphql/v2';


async function railwayGraphQLRequest(query, variables) {
    const client = new GraphQLClient(ENDPOINT, {
        headers: {
            Authorization: `Bearer ${RAILWAY_API_TOKEN}`,
        },
    })
    try {
        return await client.request({ document: query, variables })
    } catch (error) {
        core.setFailed(`Action failed with error: ${error}`);
    }
}

async function getEnvironmentId() {
    let query =
        `query environments($projectId: String!) {
            environments(projectId: $projectId) {
                edges {
                    node {
                        id
                        name
                        serviceInstances {
                            edges {
                                node {
                                    domains {
                                        serviceDomains {
                                            domain
                                        }
                                    }
                                    serviceId
                                    startCommand
                                }
                            }
                        }
                    }
                }
            }
        }`

    const variables = {
        "projectId": PROJECT_ID,
    }

    return await railwayGraphQLRequest(query, variables)
}

async function checkIfEnvironmentExists() {
    let response = await getEnvironmentId();
    const filteredEdges = response.environments.edges.filter((edge) => edge.node.name === DEST_ENV_NAME);
    return filteredEdges.length == 1 ? { environmentId: filteredEdges[0].node.id } : null;
}

async function deleteEnvironment(environmentId) {
    try {
        let query = gql`
        mutation environmentDelete($id: String!) {
            environmentDelete(id: $id)
        }
        `

        let variables = {
            "id": environmentId,
        }

        return await railwayGraphQLRequest(query, variables)
    } catch (error) {
        core.setFailed(`Action failed with error: ${error}`);
    }
}

async function run() {
    try {
        const environmentIfExists = await checkIfEnvironmentExists();
        if (!environmentIfExists) {
            throw new Error('Environment does not exist. It may have already been deleted or it was never created');
        }

        const envrionmentDeleted = await deleteEnvironment(environmentIfExists?.environmentId);

        if (envrionmentDeleted) {
            console.log(`Environment ${DEST_ENV_NAME} deleted successfully.`);
        } else {
            throw new Error(`Environment ${DEST_ENV_NAME} could not be deleted.`);
        }
    } catch (error) {
        console.log(error)
        // Handle the error, e.g., fail the action
        core.setFailed('API calls failed');
    }
}

run();