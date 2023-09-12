const axios = require('axios');
const core = require('@actions/core');
const github = require('@actions/github');

const { request, gql, GraphQLClient } = require('graphql-request')

// Railway Required Inputs
const RAILWAY_API_TOKEN = core.getInput('RAILWAY_API_TOKEN');
const PROJECT_ID = core.getInput('PROJECT_ID');
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

async function checkIfEnvironmentExists(destName) {
    let response = await getEnvironmentId();
    const filteredEdges = response.environments.edges.filter((edge) => edge.node.name === destName);
    return filteredEdges.length == 1 ? { environmentId: filteredEdges[0].node.id, serviceId: filteredEdges[0].serviceInstances.edges[0].serviceId } : null;
}

async function deleteEnvironment(environmentId) {
    try {
        let query = gql`
        mutation environmentDelete($id: String!) {
            environmentDelete(id: $id)
        }
        `

        let variables = {
            "environmentId": environmentId,
        }

        return await railwayGraphQLRequest(query, variables)
    } catch (error) {
        core.setFailed(`Action failed with error: ${error}`);
    }
}

async function run() {
    try {
        // Get the GitHub token from the input (this is set in your action's YAML file)
        const token = core.getInput('github-token', { required: true });

        // Initialize the Octokit client
        const octokit = github.getOctokit(token);

        // Get the current repository and PR number from the context
        const { owner, repo } = github.context.repo;
        const prNumber = github.context.payload.pull_request.number;
        console.log("PR Number:", prNumber)

        // Fetch the commits for the PR
        const { data: commits } = await octokit.pulls.listCommits({
            owner,
            repo,
            pull_number: prNumber,
            per_page: 1,
            page: 1
        });

        // Get the SHA of the first commit
        const firstCommitSHA = commits[0].sha;
        const shortenedSHA = firstCommitSHA.substring(0, 8);

        let destName = `pr-${prNumber}-${shortenedSHA}`;
        console.log("destName: " + destName)

        const environmentIfExists = await checkIfEnvironmentExists(destName);
        if (!environmentIfExists) {
            throw new Error('Environment does not exist. It may have already been deleted or it was never created');
        }

        const envrionmentDeleted = await deleteEnvironment(environmentIfExists?.environmentId);

        if (envrionmentDeleted) {
            console.log(`Environment ${destName} deleted successfully.`);
        } else {
            throw new Error(`Environment ${destName} could not be deleted.`);
        }
    } catch (error) {
        console.log(error)
        // Handle the error, e.g., fail the action
        core.setFailed('API calls failed');
    }
}

run();