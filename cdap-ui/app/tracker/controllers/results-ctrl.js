/*
 * Copyright © 2016-2018 Cask Data, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

const METADATA_FILTERS = {
  name: 'Name',
  description: 'Description',
  userTags: 'User tags',
  systemTags: 'System tags',
  userProperties: 'User properties',
  systemProperties: 'System properties',
  schema: 'Schema'
};

class TrackerResultsController {
  constructor($state, myTrackerApi, $scope, myHelpers) {
    this.$state = $state;
    this.$scope = $scope;
    this.myTrackerApi = myTrackerApi;
    this.myHelpers = myHelpers;

    this.loading = false;
    this.entitiesShowAllButton = false;
    this.metadataShowAllButton = false;
    this.currentPage = 1;
    this.fullResults = [];
    this.searchResults = [];
    this.sortByOptions = [
      {
        name: 'Oldest first',
        sort: 'createDate'
      },
      {
        name: 'Newest first',
        sort: '-createDate'
      },
      {
        name: 'A → Z',
        sort: 'name'
      },
      {
        name: 'Z → A',
        sort: '-name'
      }
    ];

    this.sortBy = this.sortByOptions[0];

    this.entityFiltersList = [
      {
        name: 'Datasets',
        isActive: true,
        isHover: false,
        filter: 'Dataset',
        count: 0
      },
      {
        name: 'Streams',
        isActive: true,
        isHover: false,
        filter: 'Stream',
        count: 0
      },
      {
        name: 'Stream Views',
        isActive: true,
        isHover: false,
        filter: 'Stream View',
        count: 0
      }
    ];

    this.metadataFiltersList = [
      {
        name: METADATA_FILTERS.name,
        isActive: true,
        isHover: false,
        count: 0
      },
      {
        name: METADATA_FILTERS.description,
        isActive: true,
        isHover: false,
        count: 0
      },
      {
        name: METADATA_FILTERS.userTags,
        isActive: true,
        isHover: false,
        count: 0
      },
      {
        name: METADATA_FILTERS.systemTags,
        isActive: true,
        isHover: false,
        count: 0
      },
      {
        name: METADATA_FILTERS.userProperties,
        isActive: true,
        isHover: false,
        count: 0
      },
      {
        name: METADATA_FILTERS.systemProperties,
        isActive: true,
        isHover: false,
        count: 0
      },
      {
        name: METADATA_FILTERS.schema,
        isActive: true,
        isHover: false,
        count: 0
      }
    ];

    this.numMetadataFiltersMatched = 0;
    this.fetchResults();
  }

  fetchResults () {
    this.loading = true;

    let params = {
      namespace: this.$state.params.namespace,
      query: this.$state.params.searchQuery,
      scope: this.$scope,
      entityScope: 'USER'
    };

    if (params.query === '*') {
      params.sort = 'creation-time desc';
      params.numCursors = 10;
    } else if (params.query.charAt(params.query.length - 1) !== '*') {
      params.query = params.query + '*';
    }

    this.myTrackerApi.search(params)
      .$promise
      .then( (res) => {
        this.fullResults = res.results.map(this.parseResult.bind(this));
        this.numMetadataFiltersMatched = this.getMatchedFiltersCount();
        this.searchResults = angular.copy(this.fullResults);
        this.loading = false;
      }, (err) => {
        console.log('error', err);
        this.loading = false;
      });
  }
  parseResult (entity) {
    let obj = {};
    let query = this.myHelpers.objectQuery;
    let system = query(entity, 'metadata', 'SYSTEM');
    let sysProps = query(system, 'properties');
    if (entity.entityId.entity === 'DATASET') {
      angular.extend(obj, {
        name: entity.entityId.dataset,
        type: 'Dataset',
        entityTypeState: 'datasets',
        icon: 'icon-datasets'
      });
      if (system && sysProps) {
        angular.extend(obj, {
          description: query(sysProps, 'description') || 'No description provided for this Dataset.',
          createDate: query(sysProps, 'creation-time') || null,
          datasetType: query(sysProps, 'type') || null
        });
        if (query(system, 'tags') && system.tags.indexOf('explore') !== -1) {
          obj.datasetExplorable = true;
        }
      }

      obj.queryFound = this.findQueries(entity, obj);
      this.entityFiltersList[0].count++;
    } else if (entity.entityId.entity === 'STREAM') {
      angular.extend(obj, {
        name: entity.entityId.stream,
        type: 'Stream',
        entityTypeState: 'streams',
        icon: 'icon-streams'
      });
      if (system && sysProps) {
        angular.extend(obj, {
          description: query(sysProps, 'description') || 'No description provided for this Stream.',
          createDate: query(sysProps, 'creation-time') || null,
        });
      }
      obj.queryFound = this.findQueries(entity, obj);
      this.entityFiltersList[1].count++;
    } else if (entity.entityId.entity === 'VIEW') {
      // THIS SECTION NEEDS TO BE UPDATED
      angular.extend(obj, {
        name: entity.entityId.view,
        type: 'Stream View',
        entityTypeState: 'views:' + entity.entityId.stream,
        icon: 'icon-streams'
      });
      if (system && sysProps) {
        angular.extend(obj, {
          description: query(sysProps, 'description') || 'No description provided for this Stream View.',
          createDate: query(sysProps, 'creation-time') || null
        });
      }
      obj.queryFound = this.findQueries(entity, obj);
      this.entityFiltersList[2].count++;
    }
    return obj;
  }

  findQueries(entity, parsedEntity) {
    // Removing special characters from search query
    let replaceRegex = new RegExp('[^a-zA-Z0-9]', 'g');
    let searchTerm = this.$state.params.searchQuery.replace(replaceRegex, '');

    let regex = new RegExp(searchTerm, 'ig');

    let foundIn = [];

    if (parsedEntity.name.search(regex) > -1) {
      foundIn.push(METADATA_FILTERS.name);
      this.metadataFiltersList[0].count++;
    }
    if (entity.metadata.SYSTEM && entity.metadata.SYSTEM.properties.description && entity.metadata.SYSTEM.properties.description.search(regex) > -1) {
      foundIn.push(METADATA_FILTERS.description);
      this.metadataFiltersList[1].count++;
    }

    let userTags = this.myHelpers.objectQuery(entity, 'metadata', 'USER', 'tags') || '';
    userTags = userTags.toString();
    let systemTags = this.myHelpers.objectQuery(entity, 'metadata', 'SYSTEM', 'tags') || '';
    systemTags = systemTags.toString();

    if (userTags.search(regex) > -1) {
      foundIn.push(METADATA_FILTERS.userTags);
      this.metadataFiltersList[2].count++;
    }
    if (systemTags.search(regex) > -1) {
      foundIn.push(METADATA_FILTERS.systemTags);
      this.metadataFiltersList[3].count++;
    }

    let userProperties = this.myHelpers.objectQuery(entity, 'metadata', 'USER', 'properties') || {};
    userProperties = JSON.stringify(userProperties);
    let systemProperties = this.myHelpers.objectQuery(entity, 'metadata', 'SYSTEM', 'properties') || {};
    systemProperties = JSON.stringify(systemProperties);

    if (userProperties.search(regex) > -1) {
      foundIn.push(METADATA_FILTERS.userProperties);
      this.metadataFiltersList[4].count++;
    }
    if (systemProperties.search(regex) > -1) {
      foundIn.push(METADATA_FILTERS.systemProperties);
      this.metadataFiltersList[5].count++;
    }

    let schema = this.myHelpers.objectQuery(entity, 'metadata', 'SYSTEM', 'properties', 'schema') || '';

    if (schema.search(regex) > -1) {
      foundIn.push(METADATA_FILTERS.schema);
      this.metadataFiltersList[6].count++;
    }

    return foundIn;
  }

  onlyFilter(event, filter, filterType) {
    event.preventDefault();

    let filterObj = [];
    if (filterType === 'ENTITIES') {
      filterObj = this.entityFiltersList;
    } else if (filterType === 'METADATA') {
      filterObj = this.metadataFiltersList;
    }

    angular.forEach(filterObj, (entity) => {
      entity.isActive = entity.name === filter.name ? true : false;
    });

    this.filterResults();
  }

  filterResults() {
    let filter = [];
    angular.forEach(this.entityFiltersList, (entity) => {
      if (entity.isActive) { filter.push(entity.filter); }
    });

    let entitySearchResults = this.fullResults.filter( (result) => {
      return filter.indexOf(result.type) > -1 ? true : false;
    });

    let metadataFilter = [];
    angular.forEach(this.metadataFiltersList, (metadata) => {
      if (metadata.isActive) { metadataFilter.push(metadata.name); }
    });

    this.searchResults = entitySearchResults.filter( (result) => {
      if (result.queryFound.length === 0) {
        return true;
      }
      return _.intersection(metadataFilter, result.queryFound).length > 0;
    });
  }

  showAll (filterType) {
    let filterArr = [];
    if (filterType === 'ENTITIES') {
      filterArr = this.entityFiltersList;
    } else if (filterType === 'METADATA') {
      filterArr = this.metadataFiltersList;
    }

    angular.forEach(filterArr, (filter) => {
      filter.isActive = true;
    });

    this.filterResults();
  }

  evaluateShowResultCount() {
    let lowerLimit = (this.currentPage - 1) * 10 + 1;
    let upperLimit = (this.currentPage - 1) * 10 + 10;

    upperLimit = upperLimit > this.searchResults.length ? this.searchResults.length : upperLimit;

    return this.searchResults.length === 0 ? '0' : lowerLimit + '-' + upperLimit;
  }

  getMatchedFiltersCount() {
    let metadataFilterCount = 0;
    angular.forEach(this.metadataFiltersList, (metadata) => {
      if (metadata.count > 0) { metadataFilterCount++; }
    });
    return metadataFilterCount;
  }
}

angular.module(PKG.name + '.feature.tracker')
 .controller('TrackerResultsController', TrackerResultsController);
