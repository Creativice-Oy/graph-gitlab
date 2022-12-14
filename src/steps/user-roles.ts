import {
  IntegrationStep,
  IntegrationStepExecutionContext,
  createDirectRelationship,
  getRawData,
} from '@jupiterone/integration-sdk-core';

import { createGitlabClient } from '../provider';
import { GitlabIntegrationConfig } from '../types';
import { Entities, Relationships, Steps } from '../constants';
import {
  createUserAccessRoleEntity,
  createUserEntityIdentifier,
} from '../converters';
import { GitLabGroup, GitLabProject, GitLabUserRef } from '../provider/types';

async function fetchUserAccessRoles({
  instance,
  jobState,
  logger,
}: IntegrationStepExecutionContext<GitlabIntegrationConfig>) {
  const client = createGitlabClient(instance.config, logger);
  await jobState.iterateEntities(
    { _type: Entities.GROUP._type },
    async (group) => {
      const groupData = getRawData<GitLabGroup>(group);
      if (!groupData) {
        logger.warn({ _key: group._key }, 'Raw data does not exist for group.');
        return;
      }
      const members = await client.fetchGroupMembers(groupData.id);
      const userAccessRoleEntities = members.map(
        createUserAccessRoleEntity(`group:${groupData.id}`),
      );
      await jobState.addEntities(userAccessRoleEntities);
      await jobState.addRelationships(
        userAccessRoleEntities.map((entity) =>
          createDirectRelationship({
            from: group,
            to: entity,
            _class: Relationships.GROUP_HAS_USER_ACCESS_ROLE._class,
          }),
        ),
      );
    },
  );
  await jobState.iterateEntities(
    { _type: Entities.PROJECT._type },
    async (project) => {
      const projectData = getRawData<GitLabProject>(project);
      if (!projectData) {
        logger.warn(
          { _key: project._key },
          'Raw data does not exist for project.',
        );
        return;
      }
      const members = await client.fetchProjectMembers(projectData.id);
      const userAccessRoleEntities = members.map(
        createUserAccessRoleEntity(`project:${projectData.id}`),
      );
      await jobState.addEntities(userAccessRoleEntities);
      await jobState.addRelationships(
        userAccessRoleEntities.map((entity) =>
          createDirectRelationship({
            from: project,
            to: entity,
            _class: Relationships.PROJECT_HAS_USER_ACCESS_ROLE._class,
          }),
        ),
      );
    },
  );
}

async function buildUserAccessRoleAllowsUser({
  jobState,
  logger,
}: IntegrationStepExecutionContext<GitlabIntegrationConfig>) {
  await jobState.iterateEntities(
    { _type: Entities.USER_ACCESS_ROLE._type },
    async (userAccessRole) => {
      const userAccessRoleData = getRawData<GitLabUserRef>(userAccessRole);
      if (!userAccessRoleData) {
        logger.warn(
          { _key: userAccessRole._key },
          'Raw data does not exist for user access role.',
        );
        return;
      }
      const userEntity = await jobState.findEntity(
        createUserEntityIdentifier(userAccessRoleData.id),
      );
      if (!userEntity) return;
      await jobState.addRelationship(
        createDirectRelationship({
          from: userAccessRole,
          to: userEntity,
          _class: Relationships.USER_ACCESS_ROLE_ALLOWS_USER._class,
        }),
      );
    },
  );
}

export const userAccessRoleSteps: IntegrationStep<GitlabIntegrationConfig>[] = [
  {
    id: Steps.USER_ACCESS_ROLES,
    name: 'Fetch user access roles',
    entities: [Entities.USER_ACCESS_ROLE],
    relationships: [
      Relationships.GROUP_HAS_USER_ACCESS_ROLE,
      Relationships.PROJECT_HAS_USER_ACCESS_ROLE,
    ],
    executionHandler: fetchUserAccessRoles,
    dependsOn: [Steps.PROJECTS, Steps.GROUPS],
  },
  {
    id: Steps.BUILD_USER_ACCESS_ROLE_ALLOWS_USER,
    name: 'Build user access role allows user relationships',
    entities: [],
    relationships: [Relationships.USER_ACCESS_ROLE_ALLOWS_USER],
    executionHandler: buildUserAccessRoleAllowsUser,
    dependsOn: [Steps.USER_ACCESS_ROLES, Steps.USERS],
  },
];
