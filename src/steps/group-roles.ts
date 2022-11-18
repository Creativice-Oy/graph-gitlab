import {
  IntegrationStep,
  IntegrationStepExecutionContext,
  createDirectRelationship,
  getRawData,
} from '@jupiterone/integration-sdk-core';

import { GitlabIntegrationConfig } from '../types';
import { Entities, Relationships, Steps } from '../constants';
import { createGroupAccessRoleEntity } from '../converters';
import { GitLabGroupRef, GitLabProject } from '../provider/types';
import { createGroupEntityIdentifier } from './fetch-groups';

async function fetchGroupAccessRoles({
  jobState,
  logger,
}: IntegrationStepExecutionContext<GitlabIntegrationConfig>) {
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
      const { id, shared_with_groups } = projectData;
      const groupRefs: GitLabGroupRef[] = shared_with_groups as GitLabGroupRef[];
      const groupAccessRoleEntities = groupRefs.map(
        createGroupAccessRoleEntity(id as number),
      );
      await jobState.addEntities(groupAccessRoleEntities);
      await jobState.addRelationships(
        groupAccessRoleEntities.map((entity) =>
          createDirectRelationship({
            from: project,
            to: entity,
            _class: Relationships.PROJECT_HAS_GROUP_ACCESS_ROLE._class,
          }),
        ),
      );
    },
  );
}

async function buildGroupAccessRoleAllowsGroup({
  jobState,
  logger,
}: IntegrationStepExecutionContext<GitlabIntegrationConfig>) {
  await jobState.iterateEntities(
    { _type: Entities.GROUP_ACCESS_ROLE._type },
    async (groupAccessRole) => {
      const groupAccessRoleData = getRawData<GitLabGroupRef>(groupAccessRole);
      if (!groupAccessRoleData) {
        logger.warn(
          { _key: groupAccessRole._key },
          'Raw data does not exist for group access role.',
        );
        return;
      }
      const groupEntity = await jobState.findEntity(
        createGroupEntityIdentifier(groupAccessRoleData.group_id),
      );
      if (!groupEntity) return;
      await jobState.addRelationship(
        createDirectRelationship({
          from: groupAccessRole,
          to: groupEntity,
          _class: Relationships.GROUP_ACCESS_ROLE_ALLOWS_GROUP._class,
        }),
      );
    },
  );
}

export const groupAccessRoleSteps: IntegrationStep<GitlabIntegrationConfig>[] = [
  {
    id: Steps.GROUP_ACCESS_ROLES,
    name: 'Fetch group access roles',
    entities: [Entities.GROUP_ACCESS_ROLE],
    relationships: [Relationships.PROJECT_HAS_GROUP_ACCESS_ROLE],
    executionHandler: fetchGroupAccessRoles,
    dependsOn: [Steps.PROJECTS],
  },
  {
    id: Steps.BUILD_GROUP_ACCESS_ROLE_ALLOWS_USER,
    name: 'Build group access role allows user relationships',
    entities: [],
    relationships: [Relationships.GROUP_ACCESS_ROLE_ALLOWS_GROUP],
    executionHandler: buildGroupAccessRoleAllowsGroup,
    dependsOn: [Steps.GROUP_ACCESS_ROLES, Steps.USERS],
  },
];
